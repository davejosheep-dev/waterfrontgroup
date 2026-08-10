import { addDays, addMinutes, format, isAfter, isBefore, parseISO } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { normalizeEmail, normalizePhilippineMobile, TIMEZONE } from "./domain";

export type PublicRequestType = "main_dining" | "vip_room" | "private_event";
export type PublicAvailabilityState = "available" | "limited" | "unavailable" | "requires_staff_review";
export type PublicRequestStatus =
  | "submitted" | "under_review" | "more_information_required" | "alternative_proposed"
  | "approved_converted" | "declined" | "withdrawn_by_guest" | "closed_duplicate" | "expired_unresolved";

export type PublicBookingPolicy = {
  environmentEnabled: boolean;
  publicBookingEnabled: boolean;
  publicAvailabilityEnabled: boolean;
  previewMode: boolean;
  minimumLeadTimeMinutes: number;
  maximumAdvanceDays: number;
  slotIntervalMinutes: number;
  maximumPublicPartySize: number;
  allowMainDiningRequests: boolean;
  allowVipRoomRequests: boolean;
  allowPrivateEventRequests: boolean;
  requireEmail: boolean;
  guestWithdrawalEnabled: boolean;
  rescheduleRequestEnabled: boolean;
  cancellationRequestEnabled: boolean;
  transactionalEmailEnabled: boolean;
  vipMinimumDurationMinutes: number;
  termsVersion: string;
  privacyVersion: string;
};

export const previewPublicPolicy: PublicBookingPolicy = {
  environmentEnabled: process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PHASE2_PREVIEW === "true",
  publicBookingEnabled: false,
  publicAvailabilityEnabled: true,
  previewMode: process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PHASE2_PREVIEW === "true",
  minimumLeadTimeMinutes: 120,
  maximumAdvanceDays: 90,
  slotIntervalMinutes: 30,
  maximumPublicPartySize: 60,
  allowMainDiningRequests: true,
  allowVipRoomRequests: true,
  allowPrivateEventRequests: true,
  requireEmail: false,
  guestWithdrawalEnabled: true,
  rescheduleRequestEnabled: true,
  cancellationRequestEnabled: true,
  transactionalEmailEnabled: false,
  vipMinimumDurationMinutes: 240,
  termsVersion: "preview-2026-08",
  privacyVersion: "preview-2026-08",
};

export type PublicAvailability = {
  state: PublicAvailabilityState;
  message: string;
  alternatives: string[];
  depositExpected: boolean;
};

export type PublicRequestInput = {
  requestType: PublicRequestType;
  date: string;
  time: string;
  endTime?: string;
  durationMinutes: number;
  guestCount: number;
  fullName: string;
  mobile: string;
  email?: string;
  company?: string;
  occasion?: string;
  seatingPreference?: string;
  specialRequest?: string;
  termsAccepted: boolean;
  marketingConsent?: boolean;
  startedAt: number;
  website?: string;
};

export type PublicRequestRecord = PublicRequestInput & {
  id: string;
  reference: string;
  mobileNormalized: string;
  emailNormalized: string | null;
  status: PublicRequestStatus;
  availabilitySnapshot: PublicAvailabilityState;
  currentAvailability: PublicAvailabilityState;
  depositExpected: boolean;
  submittedAt: string;
  firstReviewedAt?: string;
  resolvedAt?: string;
  assignedOwner?: string;
  linkedReservationId?: string;
  linkedReservationCode?: string;
  reasonCategory?: string;
  guestMessage?: string;
  proposedAlternative?: string;
  likelyDuplicate?: boolean;
  termsVersion: string;
  privacyVersion: string;
};

const statusTransitions: Record<PublicRequestStatus, PublicRequestStatus[]> = {
  submitted: ["under_review", "withdrawn_by_guest", "closed_duplicate", "expired_unresolved"],
  under_review: ["more_information_required", "alternative_proposed", "approved_converted", "declined", "withdrawn_by_guest", "closed_duplicate", "expired_unresolved"],
  more_information_required: ["under_review", "alternative_proposed", "approved_converted", "declined", "withdrawn_by_guest", "expired_unresolved"],
  alternative_proposed: ["under_review", "approved_converted", "declined", "withdrawn_by_guest", "expired_unresolved"],
  approved_converted: [], declined: [], withdrawn_by_guest: [], closed_duplicate: [], expired_unresolved: [],
};

export function canTransitionPublicRequest(from: PublicRequestStatus, to: PublicRequestStatus) {
  return statusTransitions[from].includes(to);
}

export function requestTypeLabel(type: PublicRequestType) {
  return type === "main_dining" ? "Main Dining" : type === "vip_room" ? "VIP Room" : "Private Event";
}

export function generatePublicSlots(localDate: string, policy: PublicBookingPolicy, now = new Date()) {
  const opening = fromZonedTime(`${localDate}T11:00:00`, TIMEZONE);
  const closing = fromZonedTime(`${localDate}T21:30:00`, TIMEZONE);
  const earliest = addMinutes(now, policy.minimumLeadTimeMinutes);
  const latest = addDays(now, policy.maximumAdvanceDays);
  if (isAfter(opening, latest) || isBefore(closing, earliest)) return [];
  const slots: string[] = [];
  let cursor = opening;
  while (!isAfter(cursor, closing)) {
    if (!isBefore(cursor, earliest) && !isAfter(cursor, latest)) slots.push(format(toZonedTime(cursor, TIMEZONE), "HH:mm"));
    cursor = addMinutes(cursor, policy.slotIntervalMinutes);
  }
  return slots;
}

export function publicAvailabilityFor(
  input: Pick<PublicRequestInput, "requestType" | "date" | "time" | "guestCount" | "durationMinutes">,
  policy = previewPublicPolicy,
  now = new Date(),
): PublicAvailability {
  if (!policy.environmentEnabled || (!policy.previewMode && !policy.publicBookingEnabled)) {
    return { state: "unavailable", message: "Online requests are temporarily unavailable. Please contact Waterfront directly.", alternatives: [], depositExpected: false };
  }
  if (input.requestType === "private_event") {
    return { state: "requires_staff_review", message: "Our events team will review your preferred date, requirements, and existing bookings.", alternatives: [], depositExpected: true };
  }
  const cap = input.requestType === "vip_room" ? 24 : policy.maximumPublicPartySize;
  if (input.guestCount < 1 || input.guestCount > cap) {
    return { state: "unavailable", message: `This request exceeds the ${cap}-guest online request limit. Please contact our team.`, alternatives: [], depositExpected: false };
  }
  if (input.requestType === "vip_room" && input.durationMinutes < policy.vipMinimumDurationMinutes) {
    return { state: "unavailable", message: "VIP Room requests require a minimum four-hour booking window.", alternatives: [], depositExpected: true };
  }
  const slots = generatePublicSlots(input.date, policy, now);
  if (!slots.includes(input.time)) {
    const alternatives = slots.slice(0, 3);
    return { state: "unavailable", message: "That time is outside the current public request window.", alternatives, depositExpected: input.requestType === "vip_room" || input.guestCount >= 10 };
  }
  const limited = input.requestType === "main_dining" && input.guestCount >= 10;
  return {
    state: input.requestType === "vip_room" ? "requires_staff_review" : limited ? "limited" : "available",
    message: input.requestType === "vip_room" ? "This time may be requested. VIP Room requests always require staff review." : limited ? "A large-party request may be submitted for staff review." : "This time is currently open for a request.",
    alternatives: [],
    depositExpected: input.requestType === "vip_room" || input.guestCount >= 10,
  };
}

export function validatePublicRequest(input: PublicRequestInput, policy = previewPublicPolicy): string[] {
  const errors: string[] = [];
  if (!input.fullName.trim() || input.fullName.trim().length > 100) errors.push("Enter a valid full name.");
  if (!normalizePhilippineMobile(input.mobile)) errors.push("Enter a valid Philippine mobile number.");
  if (policy.requireEmail && !normalizeEmail(input.email)) errors.push("A valid email address is required.");
  if (input.email && !normalizeEmail(input.email)) errors.push("Enter a valid email address.");
  if (input.marketingConsent && !normalizeEmail(input.email)) errors.push("Add a valid email address to choose email marketing.");
  if (!input.termsAccepted) errors.push("Accept the reservation terms and privacy notice.");
  if (input.specialRequest && input.specialRequest.length > 500) errors.push("Keep special requests under 500 characters.");
  if (input.website) errors.push("Request could not be submitted.");
  if (Date.now() - input.startedAt < 1500) errors.push("Please review the request before submitting.");
  const availability = publicAvailabilityFor(input, policy);
  if (availability.state === "unavailable") errors.push(availability.message);
  return [...new Set(errors)];
}

export function duplicateFingerprint(input: Pick<PublicRequestInput, "mobile" | "email" | "requestType" | "date" | "time">) {
  return [normalizePhilippineMobile(input.mobile) ?? "invalid", normalizeEmail(input.email) ?? "", input.requestType, input.date, input.time].join("|");
}

export function sanitizeAvailabilityForPublic(value: { state: PublicAvailabilityState; message?: string; alternatives?: string[]; [key: string]: unknown }): PublicAvailability {
  return {
    state: value.state,
    message: value.message ?? "Availability requires staff review.",
    alternatives: value.alternatives ?? [],
    depositExpected: Boolean(value.depositExpected),
  };
}

export function requestAge(submittedAt: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - parseISO(submittedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
