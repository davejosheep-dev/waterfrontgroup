import { describe, expect, it } from "vitest";
import { explainAvailability, searchAvailability, type ReservationCombination, type ReservationResource, type ReservationServicePeriod, type ReservationTable } from "./reservation-engine";

const period: ReservationServicePeriod = {
  id: "dinner", venueId: "venue", code: "dinner", name: "Dinner", timezone: "Asia/Manila",
  defaultDurationMinutes: 120, slotIntervalMinutes: 30, bookingWindowDays: 90, cutoffMinutes: 0, configurationVersion: 4,
  schedules: [{ dayOfWeek: 6, localStart: "18:00", localEnd: "21:00" }],
};
const tables: ReservationTable[] = [
  { id: "t2", code: "T2", areaId: "main", minimumCapacity: 2, maximumCapacity: 2, priority: 1, onlineEligible: true, staffEligible: true, active: true },
  { id: "t4a", code: "T4-A", areaId: "main", minimumCapacity: 2, maximumCapacity: 4, priority: 0, onlineEligible: true, staffEligible: true, active: true },
  { id: "t4b", code: "T4-B", areaId: "main", minimumCapacity: 2, maximumCapacity: 4, priority: 0, onlineEligible: true, staffEligible: true, active: true },
];
const combinations: ReservationCombination[] = [{ id: "c4", name: "T4-A + T4-B", areaId: "main", minimumCapacity: 5, maximumCapacity: 8, priority: 0, onlineEligible: true, staffEligible: true, active: true, memberTableIds: ["t4a", "t4b"] }];
const input = { venueId: "venue", serviceDate: "2026-08-08", partySize: 2, channel: "public" as const, now: new Date("2026-08-07T00:00:00Z") };

describe("table-aware availability engine", () => {
  it("returns deterministic best-fit slots and uses Manila local time", () => {
    const result = searchAvailability(period, tables, combinations, [], [], [], input);
    expect(result.state).toBe("available");
    expect(result.slots[0]).toMatchObject({ localTime: "18:00", configurationVersion: 4 });
    expect(result.slots[0]?.assignment.tableIds).toEqual(["t2"]);
    expect(result.slots[0]?.startsAt).toBe("2026-08-08T10:00:00.000Z");
  });

  it("allows an explicit combination and never invents arbitrary joins", () => {
    const result = searchAvailability(period, tables, combinations, [], [], [], { ...input, partySize: 6, preferredStart: "18:00", preferredEnd: "18:00" });
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]?.assignment.combinationId).toBe("c4");
    expect(result.slots[0]?.assignment.tableIds).toEqual(["t4a", "t4b"]);
  });

  it("rejects overlap on any physical member of a combination", () => {
    const resources: ReservationResource[] = [{ tableId: "t4a", startsAt: "2026-08-08T10:00:00.000Z", endsAt: "2026-08-08T12:00:00.000Z", state: "active" }];
    const result = searchAvailability(period, tables, combinations, [], resources, [], { ...input, partySize: 6, preferredStart: "18:00", preferredEnd: "18:00" });
    expect(result.state).toBe("unavailable");
    expect(explainAvailability(result)).toContain("No eligible table");
  });

  it("honours closures and table blocks", () => {
    const closed = searchAvailability({ ...period, exceptions: [{ localDate: "2026-08-08", exceptionType: "closed", reason: "Private event" }] }, tables, combinations, [], [], [], input);
    expect(closed.reason).toBe("SERVICE_CLOSED");
    const blocked = searchAvailability(period, tables, combinations, [], [], [{ tableId: "t2", startsAt: "2026-08-08T09:00:00.000Z", endsAt: "2026-08-08T12:00:00.000Z", active: true }], { ...input, preferredStart: "18:00", preferredEnd: "18:00" });
    expect(blocked.slots[0]?.assignment.tableIds).not.toEqual(["t2"]);
  });

  it("prefers a single table over a combination with stable scoring", () => {
    const result = searchAvailability(period, tables, combinations, [], [], [], { ...input, partySize: 2, preferredStart: "18:00", preferredEnd: "18:00" });
    expect(result.slots[0]?.assignment.tableCount).toBe(1);
    expect(result.slots[0]?.assignment.score).toEqual([0, 1, -1, "t2"]);
  });
});
