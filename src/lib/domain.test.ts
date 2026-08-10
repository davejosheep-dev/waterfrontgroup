import { describe, expect, it } from "vitest";
import { canTransition, determineDepositRules, intervalsOverlap, localDateFromUtc, memberTablesLocked, normalizeEmail, normalizePhilippineMobile, reminderSchedule } from "./domain";

describe("guest normalization", () => {
  it.each([
    ["0917 123 4567", "+639171234567"], ["917-123-4567", "+639171234567"],
    ["+63 917 123 4567", "+639171234567"], ["00639171234567", "+639171234567"],
  ])("normalizes %s", (input, expected) => expect(normalizePhilippineMobile(input)).toBe(expected));
  it("rejects uncertain numbers", () => expect(normalizePhilippineMobile("12345")).toBeNull());
  it("normalizes email", () => expect(normalizeEmail(" Guest@Example.COM ")).toBe("guest@example.com"));
});

describe("booking policy", () => {
  it("includes cleaning buffer in overlaps", () => {
    expect(intervalsOverlap(new Date("2026-08-07T10:00:00Z"), new Date("2026-08-07T11:00:00Z"), 10, new Date("2026-08-07T11:05:00Z"), new Date("2026-08-07T12:00:00Z"))).toBe(true);
  });
  it("treats adjacent unbuffered intervals as available", () => {
    expect(intervalsOverlap(new Date("2026-08-07T10:00:00Z"), new Date("2026-08-07T11:00:00Z"), 0, new Date("2026-08-07T11:00:00Z"), new Date("2026-08-07T12:00:00Z"))).toBe(false);
  });
  it("uses Manila local date across UTC boundary", () => expect(localDateFromUtc("2026-08-06T16:30:00Z")).toBe("2026-08-07"));
  it("combines every applicable deposit rule", () => {
    expect(determineDepositRules({ guestCount: 12, largePartyThreshold: 10, bookingType: "vip_room", specialServiceDateRequiresDeposit: true })).toEqual(["large_party", "vip_room", "special_service_date"]);
  });
  it("schedules both VIP large-party reminders with catch-up", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const reminders = reminderSchedule("vip_room", 12, 10, new Date("2026-08-02T00:00:00Z"), now);
    expect(reminders.map((r) => r.type)).toEqual(["seven_day", "twenty_four_hour"]);
    expect(reminders[0].scheduledFor).toEqual(now);
  });
  it("validates lifecycle transitions", () => {
    expect(canTransition("confirmed", "arrived")).toBe(true);
    expect(canTransition("completed", "confirmed")).toBe(false);
  });
  it("locks every member of a table combination", () => {
    expect([...memberTablesLocked(["m4"], { comboA: ["m1", "m2"] }, "comboA")].sort()).toEqual(["m1", "m2", "m4"]);
  });
});
