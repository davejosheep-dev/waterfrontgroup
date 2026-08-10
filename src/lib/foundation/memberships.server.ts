import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessRole } from "@/lib/access-control";

const organizationRoleCode: Record<AccessRole, string> = {
  superadmin: "organization_owner",
  owner: "analyst_viewer",
  manager: "organization_member",
  staff: "organization_member",
};

const venueRoleCode: Partial<Record<AccessRole, string>> = {
  manager: "venue_manager",
  staff: "host",
};

export async function syncFoundationMemberships(
  admin: SupabaseClient,
  userId: string,
  role: AccessRole,
  venueIds: readonly string[],
) {
  const [{ data: organizations, error: organizationError }, { data: venues, error: venueError }] = await Promise.all([
    admin.from("organizations").select("id").eq("status", "active"),
    venueIds.length
      ? admin.from("outlets").select("id,organization_id").in("id", [...venueIds]).eq("active", true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (organizationError || venueError) throw new Error("Foundation membership scope is unavailable.");

  const organizationIds = role === "superadmin" || role === "owner"
    ? (organizations ?? []).map((organization) => organization.id)
    : [...new Set((venues ?? []).map((venue) => venue.organization_id))];
  if (!organizationIds.length) throw new Error("No active organization is available for this member.");

  const requestedRoleCodes = [organizationRoleCode[role], venueRoleCode[role]].filter((value): value is string => Boolean(value));
  const { data: roles, error: roleError } = await admin.from("roles").select("id,organization_id,code").in("organization_id", organizationIds).in("code", requestedRoleCodes);
  if (roleError) throw new Error("Foundation roles are unavailable.");
  const roleByScope = new Map((roles ?? []).map((item) => [`${item.organization_id}:${item.code}`, item.id]));

  const organizationMemberships = organizationIds.map((organizationId) => ({
    organization_id: organizationId,
    user_id: userId,
    role_id: roleByScope.get(`${organizationId}:${organizationRoleCode[role]}`),
    status: "active",
    joined_at: new Date().toISOString(),
    disabled_at: null,
    disabled_by: null,
  }));
  if (organizationMemberships.some((membership) => !membership.role_id)) throw new Error("A required organization role is missing.");
  const { error: membershipError } = await admin.from("organization_memberships").upsert(organizationMemberships, { onConflict: "organization_id,user_id" });
  if (membershipError) throw new Error("Organization membership could not be synchronized.");

  const disabledAt = new Date().toISOString();
  const { error: disableError } = await admin.from("venue_memberships").update({ status: "inactive", disabled_at: disabledAt }).eq("user_id", userId).eq("status", "active");
  if (disableError) throw new Error("Existing venue memberships could not be synchronized.");

  const venueRole = venueRoleCode[role];
  if (venueRole && (venues ?? []).length) {
    const venueMemberships = (venues ?? []).map((venue) => ({
      organization_id: venue.organization_id,
      venue_id: venue.id,
      user_id: userId,
      role_id: roleByScope.get(`${venue.organization_id}:${venueRole}`),
      status: "active",
      joined_at: new Date().toISOString(),
      disabled_at: null,
      disabled_by: null,
    }));
    if (venueMemberships.some((membership) => !membership.role_id)) throw new Error("A required venue role is missing.");
    const { error: venueMembershipError } = await admin.from("venue_memberships").upsert(venueMemberships, { onConflict: "venue_id,user_id" });
    if (venueMembershipError) throw new Error("Venue memberships could not be synchronized.");
  }
}

export async function deactivateFoundationMemberships(admin: SupabaseClient, userId: string, actorId: string) {
  const disabledAt = new Date().toISOString();
  const [{ error: organizationError }, { error: venueError }] = await Promise.all([
    admin.from("organization_memberships").update({ status: "inactive", disabled_at: disabledAt, disabled_by: actorId }).eq("user_id", userId).eq("status", "active"),
    admin.from("venue_memberships").update({ status: "inactive", disabled_at: disabledAt, disabled_by: actorId }).eq("user_id", userId).eq("status", "active"),
  ]);
  if (organizationError || venueError) throw new Error("Foundation memberships could not be deactivated.");
}
