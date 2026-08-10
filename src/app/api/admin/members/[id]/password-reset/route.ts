import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { passwordResetPageUrl } from "@/lib/auth-urls";
import { adminErrorResponse, AdminAccessError, createSupabaseAdminClient, requireSuperadmin } from "@/lib/admin-access";
import { generateTemporaryPassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

function validEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && z.email().safeParse(normalized).success ? normalized : null;
}

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;
  const visible = localPart.length <= 2 ? localPart[0] ?? "*" : localPart.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, localPart.length - visible.length))}@${domain}`;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!sameOrigin(request)) throw new AdminAccessError(403, "This request could not be verified.");
    const actor = await requireSuperadmin();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new AdminAccessError(400, "Invalid member.");

    const admin = createSupabaseAdminClient();
    const [{ data: target, error: targetError }, { data: authUser, error: authError }] = await Promise.all([
      admin.from("staff_profiles").select("user_id,full_name,username,email,active").eq("user_id", id).maybeSingle(),
      admin.auth.admin.getUserById(id),
    ]);
    if (targetError || authError) throw new AdminAccessError(404, "Member account could not be found.");
    if (!target?.active) throw new AdminAccessError(404, "Active member not found.");

    const email = validEmail(authUser.user?.email) ?? validEmail(target.email);
    if (email) {
      const redirectTo = passwordResetPageUrl(request.nextUrl.origin);
      if (!redirectTo) throw new AdminAccessError(503, "Password recovery is not configured for this environment.");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) throw new AdminAccessError(503, "Password recovery is not configured for this environment.");
      // Use the implicit recovery flow: the recipient's browser receives the
      // recovery session in the URL fragment, so no Superadmin PKCE cookie is
      // required to complete the reset.
      const recoveryClient = createClient(url, key, { auth: { flowType: "implicit", autoRefreshToken: false, persistSession: false } });
      const { error } = await recoveryClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new AdminAccessError(502, "The password reset email could not be sent. Try again shortly.");
      await admin.from("audit_log").insert({
        actor_id: actor.userId,
        entity_type: "staff_profile",
        entity_id: id,
        action: "password_reset_email_requested",
        metadata: { method: "email" },
      });
      return Response.json({ method: "email", email: maskEmail(email), message: `A reset link was sent to ${maskEmail(email)}.` }, { headers: { "Cache-Control": "no-store" } });
    }

    const temporaryPassword = generateTemporaryPassword();
    const { error: passwordError } = await admin.auth.admin.updateUserById(id, { password: temporaryPassword });
    if (passwordError) throw new AdminAccessError(502, "The temporary password could not be generated. Try again shortly.");
    await admin.from("audit_log").insert({
      actor_id: actor.userId,
      entity_type: "staff_profile",
      entity_id: id,
      action: "temporary_password_generated",
      metadata: { method: "temporary_password" },
    });
    return Response.json({
      method: "temporary_password",
      username: target.username,
      temporaryPassword,
      message: "A temporary password was generated. Share it securely; it will not be shown again.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
