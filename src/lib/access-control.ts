import {
  accessRoles,
  rolePermissionBundles,
  type AccessRole,
  type AppPermission,
} from "@/lib/foundation/permissions";

export { accessRoles };
export type { AccessRole, AppPermission };

export const appScreens = ["today", "requests", "events", "payments", "floor", "calendar", "guests", "marketing", "notifications", "reports", "settings", "team", "profile"] as const;
export type AppScreen = (typeof appScreens)[number];

export type AccessContext = {
  role: AccessRole;
  fullName: string;
  email?: string;
  username?: string;
  conceptId: string | null;
  conceptName: string;
  accessibleConcepts?: Array<{ id: string; name: string; timezone: string }>;
  isDemo: boolean;
};

export type TeamMember = {
  id: string;
  fullName: string;
  email: string;
  username: string;
  role: AccessRole;
  conceptIds: string[];
  conceptName: string;
  active: boolean;
  lastActive: string;
  version: number;
};

export const roleDetails: Record<AccessRole, {
  label: string;
  summary: string;
  scope: string;
  permissions: readonly AppPermission[];
}> = {
  superadmin: {
    label: "Superadmin",
    summary: "Full control of every concept, member, role, and setting.",
    scope: "All concepts",
    permissions: rolePermissionBundles.superadmin,
  },
  owner: {
    label: "Owner",
    summary: "Read-only oversight of operations and dashboards across the group.",
    scope: "All concepts · view only",
    permissions: rolePermissionBundles.owner,
  },
  manager: {
    label: "Manager",
    summary: "Runs reservations, guests, payments, floor plans, and settings for assigned concepts.",
    scope: "One or more assigned concepts",
    permissions: rolePermissionBundles.manager,
  },
  staff: {
    label: "Staff",
    summary: "Handles table reservations and daily service basics for one concept.",
    scope: "One assigned concept",
    permissions: rolePermissionBundles.staff,
  },
};

const screenAccess: Record<AccessRole, readonly AppScreen[]> = {
  superadmin: appScreens,
  owner: ["today", "requests", "events", "payments", "floor", "calendar", "guests", "notifications", "reports", "profile"],
  manager: ["today", "requests", "events", "payments", "floor", "calendar", "guests", "notifications", "reports", "settings", "profile"],
  staff: ["today", "requests", "events", "floor", "calendar", "guests", "notifications", "profile"],
};

export function hasPermission(role: AccessRole, permission: AppPermission) {
  return roleDetails[role].permissions.includes(permission);
}

export function canAccessScreen(role: AccessRole, screen: AppScreen) {
  return screenAccess[role].includes(screen);
}

export function roleNeedsConcept(role: AccessRole) {
  return role === "manager" || role === "staff";
}

export function isValidMemberAssignment(role: AccessRole, conceptIds: string[]) {
  if (role === "manager") return conceptIds.length > 0;
  if (role === "staff") return conceptIds.length === 1;
  return conceptIds.length === 0;
}

export function canManageMember(actor: AccessContext, target: TeamMember) {
  return actor.role === "superadmin" && target.id !== "current-user";
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "WF";
}
