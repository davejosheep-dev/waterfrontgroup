import { NextRequest } from "next/server";
import { z } from "zod";
import { accessRoles, roleNeedsConcept } from "@/lib/access-control";
import { AdminAccessError, adminErrorResponse, createSupabaseAdminClient, legacyRole, requireSuperadmin } from "@/lib/admin-access";
import { normalizeUsername, usernamePattern } from "@/lib/auth-identity";
import { deactivateFoundationMemberships, syncFoundationMemberships } from "@/lib/foundation/memberships.server";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  username: z.string().transform(normalizeUsername).refine((value) => usernamePattern.test(value), "Use 3-32 letters, numbers, dots, dashes, or underscores; start with a letter."),
  role: z.enum(accessRoles),
  conceptIds: z.array(z.uuid()).max(50),
  version: z.number().int().positive(),
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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!sameOrigin(request)) throw new AdminAccessError(403, "This request could not be verified.");
    const actor = await requireSuperadmin();
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!z.uuid().safeParse(id).success) throw new AdminAccessError(400, "Invalid member.");
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message = issue?.path[0] === "conceptIds" ? "Choose an active concept before saving access." : issue?.message ?? "Review the member details.";
      throw new AdminAccessError(400, message);
    }
    if (id === actor.userId && parsed.data.role !== "superadmin") throw new AdminAccessError(409, "You cannot remove your own Superadmin access.");

    const admin = createSupabaseAdminClient();
    if (parsed.data.conceptIds.length) {
      const { count, error: outletError } = await admin.from("outlets").select("id", { count: "exact", head: true }).in("id", parsed.data.conceptIds).eq("active", true);
      if (outletError || count !== parsed.data.conceptIds.length) throw new AdminAccessError(400, "One or more selected concepts are unavailable.");
    }
    const { data: updated, error } = await admin.from("staff_profiles").update({
      full_name: parsed.data.fullName,
      username: parsed.data.username,
      role: legacyRole(parsed.data.role),
      access_role: parsed.data.role,
      primary_outlet_id: parsed.data.conceptIds[0] ?? null,
      version: parsed.data.version + 1,
      updated_at: new Date().toISOString(),
    }).eq("user_id", id).eq("version", parsed.data.version).select("user_id").maybeSingle();
    if (error || !updated) throw new AdminAccessError(409, error?.code === "23505" ? "That username is already assigned to a member." : "This member changed in another session. Refresh and try again.");

    await admin.from("staff_outlet_assignments").delete().eq("user_id", id);
    if (parsed.data.conceptIds.length) {
      const { error: assignmentError } = await admin.from("staff_outlet_assignments").insert(parsed.data.conceptIds.map((outletId) => ({ user_id: id, outlet_id: outletId })));
      if (assignmentError) throw new Error("Concept assignments could not be saved.");
    }
    await syncFoundationMemberships(admin, id, parsed.data.role, parsed.data.conceptIds);
    await admin.from("audit_log").insert({ actor_id: actor.userId, outlet_id: parsed.data.conceptIds[0] ?? null, entity_type: "staff_profile", entity_id: id, action: "member_access_updated", metadata: { role: parsed.data.role, username: parsed.data.username, concept_ids: parsed.data.conceptIds, version: parsed.data.version + 1 } });
    return Response.json({ updated: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!sameOrigin(request)) throw new AdminAccessError(403, "This request could not be verified.");
    const actor = await requireSuperadmin();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new AdminAccessError(400, "Invalid member.");
    if (id === actor.userId) throw new AdminAccessError(409, "You cannot deactivate your own Superadmin account.");

    const admin = createSupabaseAdminClient();
    const { data: target } = await admin.from("staff_profiles").select("access_role,primary_outlet_id,active").eq("user_id", id).maybeSingle();
    if (!target?.active) throw new AdminAccessError(404, "Active member not found.");
    if (target.access_role === "superadmin") {
      const { count } = await admin.from("staff_profiles").select("user_id", { count: "exact", head: true }).eq("access_role", "superadmin").eq("active", true);
      if ((count ?? 0) <= 1) throw new AdminAccessError(409, "At least one active Superadmin is required.");
    }

    const { error } = await admin.from("staff_profiles").update({ active: false, deactivated_at: new Date().toISOString(), deactivated_by: actor.userId, updated_at: new Date().toISOString() }).eq("user_id", id);
    if (error) throw new Error("Deactivation failed.");
    await deactivateFoundationMemberships(admin, id, actor.userId);
    await admin.from("audit_log").insert({ actor_id: actor.userId, outlet_id: target.primary_outlet_id, entity_type: "staff_profile", entity_id: id, action: "member_deactivated", metadata: { previous_role: target.access_role } });
    return Response.json({ deactivated: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
