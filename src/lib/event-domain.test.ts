import { describe, expect, it } from "vitest";
import {
  calculateEventProposalTotals,
  canTransitionEventStage,
  occupancyInterval,
  stageProgress,
} from "@/lib/event-domain";

describe("event pipeline rules", () => {
  it("allows only canonical forward transitions and terminal cancellation", () => {
    expect(canTransitionEventStage("new_inquiry", "qualified")).toBe(true);
    expect(canTransitionEventStage("deposit_pending", "confirmed")).toBe(true);
    expect(canTransitionEventStage("confirmed", "proposal_sent")).toBe(false);
    expect(canTransitionEventStage("planning", "cancelled")).toBe(true);
  });

  it("reports pipeline progress without treating terminal stages as progress", () => {
    expect(stageProgress("new_inquiry")).toBeGreaterThan(0);
    expect(stageProgress("confirmed")).toBeGreaterThan(stageProgress("new_inquiry"));
    expect(stageProgress("closed")).toBe(0);
  });
});

describe("event commercial arithmetic", () => {
  it("calculates exact centavo totals and line discounts", () => {
    expect(calculateEventProposalTotals([
      { description: "Garden rental", quantity: 1, unitPrice: 15000, taxRate: 12 },
      { description: "Dinner", quantity: 30, unitPrice: 1250.55, discountAmount: 1000, serviceChargeRate: 5 },
    ])).toEqual({
      subtotal: 51516.5,
      discountTotal: 1000,
      taxTotal: 1800,
      serviceChargeTotal: 1825.83,
      total: 55142.33,
      lineTotals: [15000, 36516.5],
    });
  });
});

describe("event occupancy", () => {
  it("includes setup and teardown in the physical-resource interval", () => {
    expect(occupancyInterval("2026-08-20T10:00:00.000Z", "2026-08-20T14:00:00.000Z", 60, 30)).toEqual({
      startsAt: "2026-08-20T09:00:00.000Z",
      endsAt: "2026-08-20T14:30:00.000Z",
    });
  });
});
