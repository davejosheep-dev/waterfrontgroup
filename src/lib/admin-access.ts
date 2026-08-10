import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AccessRole } from "@/lib/access-control";
import { readServerEnvironment } from "@/lib/env.server";

export class AdminAccessError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function requireSuperadmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new AdminAccessError(401, "Authentication required.");

  const { data: role, error: roleError } = await supabase.rpc("current_access_role");
  if (roleError || role !== "superadmin") throw new AdminAccessError(403, "Superadmin access required.");
  return { userId: user.id };
}

export function createSupabaseAdminClient() {
  const environment = readServerEnvironment();
  if (!environment.SUPABASE_ADMIN_KEY) throw new AdminAccessError(503, "Administrative Supabase access is not configured yet.");
  return createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_ADMIN_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function isSupabaseAdminConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
      && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

export function legacyRole(role: AccessRole) {
  if (role === "superadmin") return "group_admin";
  if (role === "owner") return "read_only";
  if (role === "manager") return "outlet_manager";
  return "reservations_staff";
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminAccessError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "The member action could not be completed." }, { status: 500 });
}
