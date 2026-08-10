export const accessRoles = ["superadmin", "owner", "manager", "staff"] as const;
export type AccessRole = (typeof accessRoles)[number];

export const appPermissions = [
  "view_all_concepts",
  "view_dashboard",
  "operate_reservations",
  "manage_floor",
  "manage_payments",
  "manage_guests",
  "manage_marketing",
  "manage_configuration",
  "manage_members",
] as const;
export type AppPermission = (typeof appPermissions)[number];

export const atomicPermissions = [
  "organizations.read",
  "organizations.manage",
  "venues.read",
  "venues.manage",
  "staff.read",
  "staff.invite",
  "staff.deactivate",
  "roles.manage",
  "guests.read",
  "guests.create",
  "guests.update",
  "guests.merge",
  "guest_notes.read",
  "guest_notes.write",
  "guest_notes.sensitive",
  "consents.read",
  "consents.manage",
  "audit.read",
  "reservations.read",
  "reservations.manage",
  "floor.read",
  "floor.manage",
  "payments.read",
  "payments.manage",
  "reports.read",
] as const;
export type AtomicPermission = (typeof atomicPermissions)[number];

/**
 * Role templates are data, not authorization branches. The database stores the
 * authoritative role/permission rows; this bundle keeps navigation responsive.
 */
export const rolePermissionBundles: Record<AccessRole, readonly AppPermission[]> = {
  superadmin: appPermissions,
  owner: ["view_all_concepts", "view_dashboard"],
  manager: ["view_dashboard", "operate_reservations", "manage_floor", "manage_payments", "manage_guests", "manage_configuration"],
  staff: ["operate_reservations", "manage_floor", "manage_guests"],
};

export type PermissionScope = {
  activeUser: boolean;
  activeMembership: boolean;
  membershipOrganizationId: string;
  requestedOrganizationId: string;
  permittedVenueIds: readonly string[];
  requestedVenueId?: string | null;
  grantedPermissions: readonly AtomicPermission[];
};

export function hasEffectivePermission(scope: PermissionScope, permission: AtomicPermission) {
  if (!scope.activeUser || !scope.activeMembership) return false;
  if (scope.membershipOrganizationId !== scope.requestedOrganizationId) return false;
  if (scope.requestedVenueId && !scope.permittedVenueIds.includes(scope.requestedVenueId)) return false;
  return scope.grantedPermissions.includes(permission);
}
