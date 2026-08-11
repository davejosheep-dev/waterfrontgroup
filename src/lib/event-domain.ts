export const eventStages = [
  "new_inquiry",
  "qualified",
  "availability_checked",
  "pencil_booking",
  "proposal_sent",
  "negotiation",
  "deposit_pending",
  "confirmed",
  "planning",
  "event_day",
  "completed",
  "final_billing",
  "closed",
  "lost",
  "cancelled",
] as const;

export type EventStage = (typeof eventStages)[number];

export const eventStageLabels: Record<EventStage, string> = {
  new_inquiry: "New inquiry",
  qualified: "Qualified",
  availability_checked: "Availability checked",
  pencil_booking: "Pencil booking",
  proposal_sent: "Proposal sent",
  negotiation: "Negotiation",
  deposit_pending: "Deposit pending",
  confirmed: "Confirmed",
  planning: "Planning",
  event_day: "Event day",
  completed: "Completed",
  final_billing: "Final billing",
  closed: "Closed",
  lost: "Lost",
  cancelled: "Cancelled",
};

export const eventPipelineStages: readonly EventStage[] = eventStages.filter(
  (stage) => !["closed", "lost", "cancelled"].includes(stage),
);

const transitionMap: Record<EventStage, readonly EventStage[]> = {
  new_inquiry: ["qualified", "lost", "cancelled"],
  qualified: ["availability_checked", "pencil_booking", "planning", "lost", "cancelled"],
  availability_checked: ["pencil_booking", "proposal_sent", "lost", "cancelled"],
  pencil_booking: ["proposal_sent", "negotiation", "deposit_pending", "planning", "lost", "cancelled"],
  proposal_sent: ["negotiation", "deposit_pending", "lost", "cancelled"],
  negotiation: ["proposal_sent", "deposit_pending", "lost", "cancelled"],
  deposit_pending: ["confirmed", "lost", "cancelled"],
  confirmed: ["planning", "cancelled"],
  planning: ["event_day", "cancelled"],
  event_day: ["completed", "cancelled"],
  completed: ["final_billing"],
  final_billing: ["closed"],
  closed: [],
  lost: [],
  cancelled: [],
};

export function canTransitionEventStage(from: EventStage, to: EventStage) {
  return from === to || transitionMap[from].includes(to);
}

export function stageProgress(stage: EventStage) {
  const index = eventPipelineStages.indexOf(stage);
  if (index < 0) return 0;
  return Math.round(((index + 1) / eventPipelineStages.length) * 100);
}

export type EventLineItemInput = {
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discountAmount?: number;
  taxRate?: number;
  serviceChargeRate?: number;
};

export type EventProposalTotals = {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  total: number;
  lineTotals: number[];
};

function cents(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

function fromCents(value: number) {
  return Math.round(value) / 100;
}

/**
 * Proposal arithmetic is intentionally done in integer centavos. The database
 * repeats the same calculation with NUMERIC so display and persisted totals do
 * not drift through binary floating-point rounding.
 */
export function calculateEventProposalTotals(items: readonly EventLineItemInput[]): EventProposalTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  let serviceChargeTotal = 0;
  const lineTotals: number[] = [];

  for (const item of items) {
    const lineBase = Math.max(0, Math.round(item.quantity * cents(item.unitPrice)));
    const discount = Math.min(lineBase, Math.max(0, cents(item.discountAmount ?? 0)));
    const line = Math.max(0, lineBase - discount);
    const tax = Math.round((line * Math.max(0, item.taxRate ?? 0)) / 100);
    const service = Math.round((line * Math.max(0, item.serviceChargeRate ?? 0)) / 100);
    subtotal += line;
    discountTotal += discount;
    taxTotal += tax;
    serviceChargeTotal += service;
    lineTotals.push(fromCents(line));
  }

  return {
    subtotal: fromCents(subtotal),
    discountTotal: fromCents(discountTotal),
    taxTotal: fromCents(taxTotal),
    serviceChargeTotal: fromCents(serviceChargeTotal),
    total: fromCents(subtotal + taxTotal + serviceChargeTotal),
    lineTotals,
  };
}

export function occupancyInterval(startsAt: string, endsAt: string, setupMinutes: number, teardownMinutes: number) {
  const starts = new Date(startsAt).getTime() - Math.max(0, setupMinutes) * 60_000;
  const ends = new Date(endsAt).getTime() + Math.max(0, teardownMinutes) * 60_000;
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) return null;
  return { startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString() };
}

export function isEventStage(value: string): value is EventStage {
  return (eventStages as readonly string[]).includes(value);
}
