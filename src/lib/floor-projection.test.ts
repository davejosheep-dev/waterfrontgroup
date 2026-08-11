import { describe, expect, it } from "vitest";
import { deriveTablePresentationState, findAssignmentConflicts, validateArrivalCount, validateTableAssignment } from "@/lib/floor-projection";

describe("floor presentation projection", () => {
  const now = "2026-08-10T12:00:00.000Z";

  it("follows safety-first precedence", () => {
    expect(deriveTablePresentationState({ active: false, sessionState: "active" })).toBe("inactive");
    expect(deriveTablePresentationState({ active: true, hasActiveOverride: true, sessionState: "active" })).toBe("blocked");
    expect(deriveTablePresentationState({ active: true, sessionState: "active", arrivedCount: 2 })).toBe("seated");
    expect(deriveTablePresentationState({ active: true, sessionState: "clearing" })).toBe("needs_clearing");
    expect(deriveTablePresentationState({ active: true, arrivedCount: 1, reservationStartsAt: "2026-08-10T12:05:00.000Z", now })).toBe("arrived");
    expect(deriveTablePresentationState({ active: true, reservationStartsAt: "2026-08-10T12:20:00.000Z", now })).toBe("soon");
    expect(deriveTablePresentationState({ active: true, reservationStartsAt: "2026-08-10T15:00:00.000Z", now })).toBe("available");
  });
});

describe("floor command guards", () => {
  it("bounds partial arrivals", () => {
    expect(validateArrivalCount(0, 4).valid).toBe(true);
    expect(validateArrivalCount(5, 4).valid).toBe(false);
    expect(validateArrivalCount(-1, 4).valid).toBe(false);
  });

  it("rejects duplicate or undersized assignments", () => {
    expect(validateTableAssignment(["a", "a"], 8, 4).valid).toBe(false);
    expect(validateTableAssignment(["a"], 2, 4).valid).toBe(false);
    expect(validateTableAssignment(["a", "b"], 8, 4).valid).toBe(true);
  });

  it("finds only physical overlaps", () => {
    expect(findAssignmentConflicts([
      { tableId: "a", startsAt: "2026-08-10T12:00:00Z", endsAt: "2026-08-10T13:00:00Z" },
      { tableId: "b", startsAt: "2026-08-10T12:00:00Z", endsAt: "2026-08-10T13:00:00Z" },
    ], [{ tableId: "a", startsAt: "2026-08-10T12:30:00Z", endsAt: "2026-08-10T13:30:00Z" }])).toEqual(["a"]);
  });
});

