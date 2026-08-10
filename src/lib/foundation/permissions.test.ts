import { describe, expect, it } from "vitest";
import { hasEffectivePermission, type PermissionScope } from "./permissions";

const venueScope: PermissionScope = {
  activeUser: true,
  activeMembership: true,
  membershipOrganizationId: "waterfront-group",
  requestedOrganizationId: "waterfront-group",
  permittedVenueIds: ["iloilo"],
  requestedVenueId: "iloilo",
  grantedPermissions: ["venues.read", "guests.read", "reservations.manage"],
};

describe("effective permission", () => {
  it("allows an active matching membership and venue", () => {
    expect(hasEffectivePermission(venueScope, "guests.read")).toBe(true);
  });

  it("denies cross-organization and cross-venue access", () => {
    expect(hasEffectivePermission({ ...venueScope, requestedOrganizationId: "other" }, "guests.read")).toBe(false);
    expect(hasEffectivePermission({ ...venueScope, requestedVenueId: "sydney" }, "guests.read")).toBe(false);
  });

  it("revokes access as soon as a membership is inactive", () => {
    expect(hasEffectivePermission({ ...venueScope, activeMembership: false }, "guests.read")).toBe(false);
  });

  it("does not imply an ungranted permission", () => {
    expect(hasEffectivePermission(venueScope, "staff.invite")).toBe(false);
  });
});
