import { describe, expect, it } from "vitest";
import { canAccessScreen, canManageMember, hasPermission, isValidMemberAssignment, type AccessContext, type TeamMember } from "./access-control";

const superadmin: AccessContext = { role: "superadmin", fullName: "Account Owner", conceptId: null, conceptName: "All concepts", isDemo: false };
const manager: TeamMember = { id: "manager-1", fullName: "Ari Manager", email: "ari@example.com", username: "ari.manager", role: "manager", conceptIds: ["iloilo", "boracay"], conceptName: "2 concepts", active: true, lastActive: "Now", version: 1 };

describe("role permissions", () => {
  it("gives only superadmins member administration", () => {
    expect(hasPermission("superadmin", "manage_members")).toBe(true);
    expect(hasPermission("owner", "manage_members")).toBe(false);
    expect(hasPermission("manager", "manage_members")).toBe(false);
    expect(hasPermission("staff", "manage_members")).toBe(false);
  });

  it("keeps owners group-wide but operationally read-only", () => {
    expect(hasPermission("owner", "view_all_concepts")).toBe(true);
    expect(hasPermission("owner", "operate_reservations")).toBe(false);
    expect(canAccessScreen("owner", "reports")).toBe(true);
    expect(canAccessScreen("owner", "settings")).toBe(false);
  });

  it("limits staff navigation to basic concept operations", () => {
    expect(canAccessScreen("staff", "floor")).toBe(true);
    expect(canAccessScreen("staff", "payments")).toBe(false);
    expect(canAccessScreen("staff", "marketing")).toBe(false);
  });

  it("requires a concept for managers and staff only", () => {
    expect(isValidMemberAssignment("manager", ["iloilo", "boracay"])).toBe(true);
    expect(isValidMemberAssignment("manager", [])).toBe(false);
    expect(isValidMemberAssignment("staff", ["iloilo", "boracay"])).toBe(false);
    expect(isValidMemberAssignment("staff", ["iloilo"])).toBe(true);
    expect(isValidMemberAssignment("owner", [])).toBe(true);
    expect(isValidMemberAssignment("superadmin", ["iloilo"])).toBe(false);
  });

  it("prevents self-removal in the client guard", () => {
    expect(canManageMember(superadmin, manager)).toBe(true);
    expect(canManageMember(superadmin, { ...manager, id: "current-user" })).toBe(false);
  });
});
