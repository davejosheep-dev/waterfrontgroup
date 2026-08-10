import { addDays, addMinutes, format, parseISO } from "date-fns";
import { zonedDateTimeToUtc } from "@/lib/domain";

export type ReservationChannel = "public" | "staff" | "phone" | "walk_in" | "waitlist" | "integration";

export type ReservationTable = {
  id: string;
  code: string;
  areaId: string;
  minimumCapacity: number;
  maximumCapacity: number;
  priority: number;
  onlineEligible: boolean;
  staffEligible: boolean;
  active: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
  featureCodes?: string[];
};

export type ReservationCombination = {
  id: string;
  name: string;
  areaId: string;
  minimumCapacity: number;
  maximumCapacity: number;
  priority: number;
  onlineEligible: boolean;
  staffEligible: boolean;
  active: boolean;
  memberTableIds: string[];
};

export type ServiceSchedule = {
  dayOfWeek: number;
  localStart: string;
  localEnd: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  active?: boolean;
};

export type ServiceException = {
  localDate: string;
  exceptionType: "closed" | "modified" | "open";
  localStart?: string | null;
  localEnd?: string | null;
  reason: string;
  active?: boolean;
};

export type ReservationServicePeriod = {
  id: string;
  venueId: string;
  code: string;
  name: string;
  timezone: string;
  defaultDurationMinutes: number;
  slotIntervalMinutes: number;
  bookingWindowDays: number;
  cutoffMinutes: number;
  configurationVersion: number;
  schedules: ServiceSchedule[];
  exceptions?: ServiceException[];
};

export type ReservationRule = {
  ruleType: "duration" | "booking_window" | "cutoff" | "pacing" | "capacity" | "cancellation" | "deposit" | "channel" | "overbooking";
  priority: number;
  partyMin?: number | null;
  partyMax?: number | null;
  channel?: ReservationChannel | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  value: Record<string, unknown>;
  active?: boolean;
};

export type ReservationResource = {
  tableId: string;
  startsAt: string;
  endsAt: string;
  state: "held" | "active";
};

export type ReservationInventoryBlock = {
  startsAt: string;
  endsAt: string;
  tableId?: string | null;
  areaId?: string | null;
  servicePeriodId?: string | null;
  active?: boolean;
};

export type AvailabilitySearchInput = {
  venueId: string;
  servicePeriodId?: string;
  serviceDate: string;
  partySize: number;
  channel: ReservationChannel;
  preferredStart?: string | null;
  preferredEnd?: string | null;
  durationMinutes?: number;
  requiredFeatures?: string[];
  now?: Date;
};

export type AvailabilityAssignment = {
  tableIds: string[];
  combinationId?: string;
  capacity: number;
  unusedCapacity: number;
  tableCount: number;
  priorityPenalty: number;
  score: [number, number, number, string];
};

export type AvailabilitySlot = {
  localTime: string;
  startsAt: string;
  endsAt: string;
  assignment: AvailabilityAssignment;
  configurationVersion: number;
};

export type AvailabilityResult = {
  state: "available" | "limited" | "unavailable";
  servicePeriod?: Pick<ReservationServicePeriod, "id" | "code" | "name">;
  configurationVersion: number;
  slots: AvailabilitySlot[];
  reason?: string;
};

export function intervalOverlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

function dateInRange(date: string, from?: string, to?: string | null): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

function localMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function formatLocalTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function localDayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function activeRule(rules: ReservationRule[], input: AvailabilitySearchInput, ruleType: ReservationRule["ruleType"]): ReservationRule | undefined {
  return rules
    .filter((rule) => rule.active !== false && rule.ruleType === ruleType && (!rule.channel || rule.channel === input.channel))
    .filter((rule) => (!rule.partyMin || input.partySize >= rule.partyMin) && (!rule.partyMax || input.partySize <= rule.partyMax))
    .filter((rule) => dateInRange(input.serviceDate, rule.effectiveFrom, rule.effectiveTo))
    .sort((a, b) => b.priority - a.priority)[0];
}

function serviceWindow(period: ReservationServicePeriod, date: string): { localStart: string; localEnd: string } | null {
  const exception = period.exceptions?.find((item) => item.active !== false && item.localDate === date);
  if (exception?.exceptionType === "closed") return null;
  if (exception?.localStart && exception.localEnd) return { localStart: exception.localStart, localEnd: exception.localEnd };
  const schedule = period.schedules
    .filter((item) => item.active !== false && item.dayOfWeek === localDayOfWeek(date) && dateInRange(date, item.effectiveFrom, item.effectiveTo))
    .sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""))[0];
  return schedule ? { localStart: schedule.localStart, localEnd: schedule.localEnd } : null;
}

function slotMinutes(window: { localStart: string; localEnd: string }, interval: number, preferredStart?: string | null, preferredEnd?: string | null): number[] {
  const start = localMinutes(window.localStart);
  const end = localMinutes(window.localEnd);
  const lower = preferredStart ? Math.max(start, localMinutes(preferredStart)) : start;
  const upper = preferredEnd ? Math.min(end, localMinutes(preferredEnd)) : end;
  const slots: number[] = [];
  for (let current = start; current <= end - interval; current += interval) {
    if (current >= lower && current <= upper) slots.push(current);
  }
  return slots;
}

function assignmentCandidates(
  tables: ReservationTable[], combinations: ReservationCombination[], input: AvailabilitySearchInput,
): AvailabilityAssignment[] {
  const required = new Set(input.requiredFeatures ?? []);
  const eligible = (table: ReservationTable) => {
    const channelAllowed = input.channel === "public" ? table.onlineEligible : table.staffEligible;
    const dateAllowed = dateInRange(input.serviceDate, table.activeFrom ?? undefined, table.activeTo ?? undefined);
    return table.active && channelAllowed && dateAllowed && table.minimumCapacity <= input.partySize && table.maximumCapacity >= input.partySize
      && [...required].every((feature) => table.featureCodes?.includes(feature));
  };
  const assignments: AvailabilityAssignment[] = tables.filter(eligible).map((table) => ({
    tableIds: [table.id], capacity: table.maximumCapacity, unusedCapacity: table.maximumCapacity - input.partySize,
    tableCount: 1, priorityPenalty: -table.priority, score: [table.maximumCapacity - input.partySize, 1, -table.priority, table.id] as [number, number, number, string],
  }));
  for (const combination of combinations) {
    if (!combination.active || (input.channel === "public" ? !combination.onlineEligible : !combination.staffEligible)) continue;
    if (combination.minimumCapacity > input.partySize || combination.maximumCapacity < input.partySize) continue;
    const members = combination.memberTableIds.map((id) => tables.find((table) => table.id === id)).filter((table): table is ReservationTable => Boolean(table));
    if (members.length !== combination.memberTableIds.length || members.some((table) => !table.active || !dateInRange(input.serviceDate, table.activeFrom ?? undefined, table.activeTo ?? undefined))) continue;
    if ([...required].some((feature) => !members.some((table) => table.featureCodes?.includes(feature)))) continue;
    assignments.push({
      tableIds: [...combination.memberTableIds].sort(), combinationId: combination.id, capacity: combination.maximumCapacity,
      unusedCapacity: combination.maximumCapacity - input.partySize, tableCount: members.length,
      priorityPenalty: -combination.priority,
      score: [combination.maximumCapacity - input.partySize, members.length, -combination.priority, combination.id],
    });
  }
  return assignments.sort((a, b) => compareScores(a.score, b.score));
}

function compareScores(a: AvailabilityAssignment["score"], b: AvailabilityAssignment["score"]): number {
  for (let index = 0; index < a.length - 1; index += 1) {
    if (a[index] !== b[index]) return Number(a[index]) - Number(b[index]);
  }
  return a[3].localeCompare(b[3]);
}

function assignmentIsFree(
  assignment: AvailabilityAssignment, startsAt: Date, endsAt: Date,
  resources: ReservationResource[], blocks: ReservationInventoryBlock[], periodId: string,
): boolean {
  return assignment.tableIds.every((tableId) => {
    const occupied = resources.some((resource) => resource.state !== "active" && resource.state !== "held" ? false : resource.tableId === tableId && intervalOverlaps(startsAt, endsAt, new Date(resource.startsAt), new Date(resource.endsAt)));
    const blocked = blocks.some((block) => block.active !== false && (block.tableId === tableId || (!block.tableId && !block.areaId && block.servicePeriodId === periodId)) && intervalOverlaps(startsAt, endsAt, new Date(block.startsAt), new Date(block.endsAt)));
    return !occupied && !blocked;
  });
}

function passesPacing(input: AvailabilitySearchInput, startsAt: Date, rules: ReservationRule[], resources: ReservationResource[]): boolean {
  const rule = activeRule(rules, input, "pacing");
  if (!rule) return true;
  const interval = Number(rule.value.intervalMinutes ?? 30);
  const maxArrivals = Number(rule.value.maxArrivals ?? Number.POSITIVE_INFINITY);
  const windowStart = addMinutes(startsAt, -interval);
  const windowEnd = addMinutes(startsAt, interval);
  const arrivals = resources.filter((resource) => resource.state === "active" && new Date(resource.startsAt) >= windowStart && new Date(resource.startsAt) < windowEnd).length;
  return arrivals < maxArrivals;
}

export function findBestAssignment(
  tables: ReservationTable[], combinations: ReservationCombination[], input: AvailabilitySearchInput,
  startsAt: Date, endsAt: Date, resources: ReservationResource[], blocks: ReservationInventoryBlock[],
): AvailabilityAssignment | null {
  const periodId = input.servicePeriodId ?? "";
  return assignmentCandidates(tables, combinations, input).find((assignment) => assignmentIsFree(assignment, startsAt, endsAt, resources, blocks, periodId)) ?? null;
}

export function searchAvailability(
  period: ReservationServicePeriod, tables: ReservationTable[], combinations: ReservationCombination[],
  rules: ReservationRule[], resources: ReservationResource[], blocks: ReservationInventoryBlock[], input: AvailabilitySearchInput,
): AvailabilityResult {
  const service = serviceWindow(period, input.serviceDate);
  const base: AvailabilityResult = { state: "unavailable", configurationVersion: period.configurationVersion, slots: [], servicePeriod: { id: period.id, code: period.code, name: period.name } };
  if (!service) return { ...base, reason: "SERVICE_CLOSED" };
  if (input.partySize < 1) return { ...base, reason: "INVALID_PARTY_SIZE" };
  const now = input.now ?? new Date();
  const today = new Date(now.toLocaleString("en-US", { timeZone: period.timezone }));
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const latestBookableDate = format(addDays(parseISO(localToday), period.bookingWindowDays), "yyyy-MM-dd");
  if (input.serviceDate < localToday || input.serviceDate > latestBookableDate) return { ...base, reason: "OUTSIDE_BOOKING_WINDOW" };
  const durationRule = activeRule(rules, input, "duration");
  const duration = input.durationMinutes ?? Number(durationRule?.value.durationMinutes ?? period.defaultDurationMinutes);
  const cutoffRule = activeRule(rules, input, "cutoff");
  const cutoffMinutes = Number(cutoffRule?.value.minutes ?? period.cutoffMinutes);
  const candidates = slotMinutes(service, period.slotIntervalMinutes, input.preferredStart, input.preferredEnd);
  const slots: AvailabilitySlot[] = [];
  for (const minutes of candidates) {
    const localTime = formatLocalTime(minutes);
    const startsAt = zonedDateTimeToUtc(input.serviceDate, localTime, period.timezone);
    const endsAt = addMinutes(startsAt, duration);
    if (startsAt.getTime() <= now.getTime() + cutoffMinutes * 60_000) continue;
    const assignment = findBestAssignment(tables, combinations, { ...input, servicePeriodId: period.id }, startsAt, endsAt, resources, blocks);
    if (!assignment || !passesPacing(input, startsAt, rules, resources)) continue;
    slots.push({ localTime, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), assignment, configurationVersion: period.configurationVersion });
  }
  return { ...base, state: slots.length === 0 ? "unavailable" : slots.length < 3 ? "limited" : "available", slots, reason: slots.length ? undefined : "NO_FEASIBLE_TABLE" };
}

export function explainAvailability(result: AvailabilityResult): string {
  if (result.state === "available") return `${result.slots.length} table-aware times available.`;
  if (result.reason === "SERVICE_CLOSED") return "This service is closed for the selected date.";
  if (result.reason === "OUTSIDE_BOOKING_WINDOW") return "The selected date is outside the booking window.";
  if (result.reason === "NO_FEASIBLE_TABLE") return "No eligible table or approved combination is available for that time.";
  return "No availability for the selected request.";
}
