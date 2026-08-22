import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AccessContext, AccessRole } from "@/lib/access-control";
import { createSupabaseAdminClient } from "@/lib/admin-access";
import { usernameFromEmail } from "@/lib/auth-identity";
import { syncFoundationMemberships } from "@/lib/foundation/memberships.server";

export const demoAccessContext: AccessContext = {
  role: "superadmin",
  fullName: "Account Owner",
  email: "owner@waterfrontiloilo.com",
  username: "account.owner",
  conceptId: null,
  conceptName: "All concepts",
  accessibleConcepts: [
    { id: "waterfront-iloilo", name: "Waterfront · Iloilo", timezone: "Asia/Manila" },
    { id: "waterfront-training-sydney", name: "Waterfront Training · Sydney", timezone: "Australia/Sydney" },
  ],
  isDemo: true,
};

export async function getCurrentAccessContext(): Promise<AccessContext | null> {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const isProduction = process.env.APP_ENVIRONMENT === "production" || process.env.NODE_ENV === "production";
  // Demo mode is intentionally limited to local preview. A production build must
  // always resolve the authenticated Supabase user so account security controls
  // (including self-service password changes) are not silently disabled.
  //
  // The unconfigured branch is guarded the same way. It previously returned a
  // Superadmin context in any environment, so a rotated or mistyped Vercel
  // variable would have replaced the real app with an open one instead of
  // failing. In production, no configuration now means no session.
  if (isProduction && !configured) return null;
  if (!configured || (process.env.APP_DEMO_MODE === "true" && !isProduction)) return demoAccessContext;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const [{ data, error }, { data: profileIdentity }, { data: accessibleConcepts }] = await Promise.all([
      supabase.rpc("get_current_access_context"),
      supabase.from("staff_profiles").select("username").eq("user_id", user.id).maybeSingle(),
      supabase.from("outlets").select("id,name,timezone").eq("active", true).order("name"),
    ]);
    const row = Array.isArray(data) ? data[0] : null;
    if (!error && row) return {
      role: row.access_role as AccessRole,
      fullName: row.full_name,
      email: user.email ?? undefined,
      username: profileIdentity?.username ?? undefined,
      conceptId: row.concept_id,
      conceptName: row.concept_name,
      accessibleConcepts: accessibleConcepts ?? [],
      isDemo: false,
    };

    const allowlistedEmails = (process.env.SUPERADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    const email = user.email?.toLowerCase();
    if (!email || !allowlistedEmails.includes(email)) return null;
    // Bootstrapping a Superadmin is the highest-privilege action in the system,
    // so it must not rest on the project's mailer settings being right. Require
    // a confirmed address here regardless of what the hosted config says.
    if (!user.email_confirmed_at) return null;

    const admin = createSupabaseAdminClient();
    const { data: existingProfile } = await admin.from("staff_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
    if (existingProfile) return null;
    const fullName = String(user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? email.split("@")[0]).trim();
    const { error: bootstrapError } = await admin.from("staff_profiles").insert({
      user_id: user.id,
      full_name: fullName,
      email,
      username: usernameFromEmail(email, user.id),
      role: "group_admin",
      access_role: "superadmin",
      primary_outlet_id: null,
      active: true,
      deactivated_at: null,
      deactivated_by: null,
    });
    if (bootstrapError) return null;
    try {
      await syncFoundationMemberships(admin, user.id, "superadmin", []);
    } catch {
      await admin.from("staff_profiles").delete().eq("user_id", user.id);
      return null;
    }
    return {
      role: "superadmin",
      fullName,
      email,
      username: usernameFromEmail(email, user.id),
      conceptId: null,
      conceptName: "All concepts",
      accessibleConcepts: [],
      isDemo: false,
    };
  } catch {
    return null;
  }
}
