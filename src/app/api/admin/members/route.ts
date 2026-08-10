import { NextRequest } from "next/server";
import { z } from "zod";
import { accessRoles, roleNeedsConcept } from "@/lib/access-control";
import { AdminAccessError, adminErrorResponse, createSupabaseAdminClient, isSupabaseAdminConfigured, legacyRole, requireSuperadmin } from "@/lib/admin-access";
import { normalizeUsername, usernamePattern } from "@/lib/auth-identity";
import { appOrigin } from "@/lib/auth-urls";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncFoundationMemberships } from "@/lib/foundation/memberships.server";

export const dynamic = "force-dynamic";

const memberSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  username: z.string().transform(normalizeUsername).refine((value) => usernamePattern.test(value), "Use 3-32 letters, numbers, dots, dashes, or underscores; start with a letter."),
  role: z.enum(accessRoles),
  conceptIds: z.array(z.uuid()).max(50),
}).superRefine((value, context) => {
  if (value.role === "manager" && value.conceptIds.length === 0) context.addIssue({ code: "custom", path: ["conceptIds"], message: "Choose at least one concept for a Manager." });
  if (value.role === "staff" && value.conceptIds.length !== 1) context.addIssue({ code: "custom", path: ["conceptIds"], message: "Staff must have exactly one concept." });
  if (!roleNeedsConcept(value.role) && value.conceptIds.length !== 0) context.addIssue({ code: "custom", path: ["conceptIds"], message: "Group-wide roles cannot be limited to concepts." });
  if (new Set(value.conceptIds).size !== value.conceptIds.length) context.addIssue({ code: "custom", path: ["conceptIds"], message: "Each concept can only be assigned once." });
});

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function GET() {
  try {
    await requireSuperadmin();
    const supabase = await createServerSupabaseClient();
    const [{ data: profiles, error: profileError }, { data: outlets, error: outletError }, { data: assignments, error: assignmentError }] = await Promise.all([
      supabase.from("staff_profiles").select("user_id,full_name,email,username,access_role,primary_outlet_id,active,updated_at,version").order("full_name"),
      supabase.from("outlets").select("id,name").eq("active", true).order("name"),
      supabase.from("staff_outlet_assignments").select("user_id,outlet_id"),
    ]);
    if (profileError || outletError || assignmentError) throw new Error("Member directory unavailable.");
    const outletNames = new Map((outlets ?? []).map((outlet) => [outlet.id, outlet.name]));
    const assignmentsByUser = new Map<string, string[]>();
    for (const assignment of assignments ?? []) assignmentsByUser.set(assignment.user_id, [...(assignmentsByUser.get(assignment.user_id) ?? []), assignment.outlet_id]);
    return Response.json({
      members: (profiles ?? []).map((profile) => {
        const conceptIds = assignmentsByUser.get(profile.user_id) ?? [];
        const conceptNames = conceptIds.map((id) => outletNames.get(id) ?? "Assigned concept");
        return {
          id: profile.user_id,
          fullName: profile.full_name,
          email: profile.email ?? "",
          username: profile.username,
          role: profile.access_role,
          conceptIds,
          conceptName: conceptNames.length ? conceptNames.join(", ") : "All concepts",
          active: profile.active,
          lastActive: profile.updated_at,
          version: profile.version,
        };
      }),
      concepts: outlets ?? [],
      adminActionsAvailable: isSupabaseAdminConfigured(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) throw new AdminAccessError(403, "This request could not be verified.");
    const actor = await requireSuperadmin();
    const parsed = memberSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message = issue?.path[0] === "conceptIds" ? "Choose an active concept before sending the invite." : issue?.message ?? "Review the member details.";
      throw new AdminAccessError(400, message);
    }

    const admin = createSupabaseAdminClient();
    if (parsed.data.conceptIds.length) {
      const { count, error } = await admin.from("outlets").select("id", { count: "exact", head: true }).in("id", parsed.data.conceptIds).eq("active", true);
      if (error || count !== parsed.data.conceptIds.length) throw new AdminAccessError(400, "One or more selected concepts are unavailable.");
    }
    const applicationOrigin = appOrigin(request.nextUrl.origin);
    if (!applicationOrigin) throw new AdminAccessError(503, "The application URL is not configured for invitation links.");
    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { display_name: parsed.data.fullName, username: parsed.data.username },
      redirectTo: `${applicationOrigin}/login?invited=1`,
    });
    if (inviteError || !invitation.user) throw new AdminAccessError(409, "That email could not be invited. It may already belong to a user.");

    const { error: profileError } = await admin.from("staff_profiles").insert({
      user_id: invitation.user.id,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      username: parsed.data.username,
      role: legacyRole(parsed.data.role),
      access_role: parsed.data.role,
      primary_outlet_id: parsed.data.conceptIds[0] ?? null,
      active: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(invitation.user.id);
      throw new AdminAccessError(409, "That email or username is already assigned to a member.");
    }
    if (parsed.data.conceptIds.length) {
      const { error: assignmentError } = await admin.from("staff_outlet_assignments").insert(parsed.data.conceptIds.map((outletId) => ({ user_id: invitation.user.id, outlet_id: outletId })));
      if (assignmentError) {
        await admin.auth.admin.deleteUser(invitation.user.id);
        throw new AdminAccessError(409, "The concept assignments could not be saved.");
      }
    }
    try {
      await syncFoundationMemberships(admin, invitation.user.id, parsed.data.role, parsed.data.conceptIds);
    } catch {
      await admin.auth.admin.deleteUser(invitation.user.id);
      throw new AdminAccessError(409, "The organization and concept memberships could not be saved.");
    }
    await admin.from("audit_log").insert({ actor_id: actor.userId, outlet_id: parsed.data.conceptIds[0] ?? null, entity_type: "staff_profile", entity_id: invitation.user.id, action: "member_invited", metadata: { role: parsed.data.role, email: parsed.data.email, username: parsed.data.username, concept_ids: parsed.data.conceptIds } });
    return Response.json({ memberId: invitation.user.id }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
