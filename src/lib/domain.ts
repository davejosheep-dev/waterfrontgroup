import { addMinutes, isBefore, parseISO, subDays, subHours } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const TIMEZONE = "Asia/Manila";

export const liveStatuses = [
  "temporary_hold", "pending_confirmation", "pending_deposit", "confirmed", "arrived", "seated",
] as const;

export type ReservationStatus =
  | "draft" | (typeof liveStatuses)[number] | "completed" | "expired" | "cancelled" | "no_show";

export type BookingType = "regular_table" | "large_party" | "vip_room" | "private_event" | "walk_in";

export type Reservation = {
  id: string; code: string; guestName: string; guestCount: number; mobile: string; email?: string;
  bookingType: BookingType; area: "Main Dining" | "VIP Room" | "Whole Restaurant";
  date: string; start: string; durationMinutes: number; status: ReservationStatus; source: string;
  table?: string; occasion?: string; deposit: "not_required" | "pending" | "partially_paid" | "paid" | "waived";
  confirmationDueAt?: string; owner?: string; notes?: string;
};

export type DepositRuleInput = {
  guestCount: number; largePartyThreshold: number; bookingType: BookingType;
  specialServiceDateRequiresDeposit?: boolean; manualRequirement?: boolean;
};

export function normalizePhilippineMobile(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("63")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10 || !digits.startsWith("9")) return null;
  return `+63${digits}`;
}

export function normalizeEmail(value?: string): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

export function isLiveStatus(status: ReservationStatus): boolean {
  return (liveStatuses as readonly string[]).includes(status);
}

export function intervalsOverlap(
  startA: Date, endA: Date, bufferAMinutes: number,
  startB: Date, endB: Date, bufferBMinutes = 0,
): boolean {
  return startA < addMinutes(endB, bufferBMinutes) && startB < addMinutes(endA, bufferAMinutes);
}

export function localDateFromUtc(value: string | Date): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  const local = toZonedTime(date, TIMEZONE);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

export function zonedDateTimeToUtc(localDate: string, localTime: string): Date {
  return fromZonedTime(`${localDate}T${localTime}:00`, TIMEZONE);
}

export function determineDepositRules(input: DepositRuleInput): string[] {
  const rules: string[] = [];
  if (input.guestCount >= input.largePartyThreshold) rules.push("large_party");
  if (input.bookingType === "vip_room") rules.push("vip_room");
  if (input.bookingType === "private_event") rules.push("private_event");
  if (input.specialServiceDateRequiresDeposit) rules.push("special_service_date");
  if (input.manualRequirement) rules.push("manual");
  return rules;
}

export function reminderSchedule(
  bookingType: BookingType, guestCount: number, threshold: number, startsAt: Date, now: Date,
): Array<{ type: "seven_day" | "twenty_four_hour"; scheduledFor: Date }> {
  const reminders: Array<{ type: "seven_day" | "twenty_four_hour"; scheduledFor: Date }> = [];
  if (bookingType === "private_event" || guestCount >= threshold) {
    const scheduled = subDays(startsAt, 7);
    reminders.push({ type: "seven_day", scheduledFor: isBefore(scheduled, now) ? now : scheduled });
  }
  if (bookingType === "regular_table" || bookingType === "vip_room") {
    const scheduled = subHours(startsAt, 24);
    reminders.push({ type: "twenty_four_hour", scheduledFor: isBefore(scheduled, now) ? now : scheduled });
  }
  return reminders;
}

const transitions: Record<ReservationStatus, ReservationStatus[]> = {
  draft: ["temporary_hold", "pending_confirmation", "pending_deposit", "cancelled"],
  temporary_hold: ["pending_confirmation", "pending_deposit", "confirmed", "expired", "cancelled"],
  pending_confirmation: ["pending_deposit", "confirmed", "expired", "cancelled"],
  pending_deposit: ["confirmed", "expired", "cancelled"],
  confirmed: ["arrived", "cancelled", "no_show"], arrived: ["seated", "cancelled", "no_show"],
  seated: ["completed"], completed: [], expired: [], cancelled: [], no_show: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return transitions[from].includes(to);
}

export function memberTablesLocked(
  assignedTableIds: string[], combinationMembers: Record<string, string[]>, combinationId?: string,
): Set<string> {
  return new Set([...assignedTableIds, ...(combinationId ? combinationMembers[combinationId] ?? [] : [])]);
}
