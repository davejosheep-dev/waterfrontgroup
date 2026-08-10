import "server-only";
import { z } from "zod";
import { normalizeEmail, normalizePhilippineMobile, type Reservation } from "./domain";
import {
  canTransitionPublicRequest, duplicateFingerprint, previewPublicPolicy, publicAvailabilityFor,
  type PublicRequestInput, type PublicRequestRecord, type PublicRequestStatus,
} from "./public-booking";
import { createManageToken, createRequestReference, hashManageToken, SlidingWindowRateLimit } from "./public-security";
import { requestReceivedEmail } from "./public-security";
import { emailAdapter } from "./email-adapter";

const requestSchema = z.object({
  requestType: z.enum(["main_dining", "vip_room", "private_event"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMinutes: z.number().int().min(60).max(720),
  guestCount: z.number().int().min(1).max(300),
  fullName: z.string().trim().min(2).max(100),
  mobile: z.string().min(7).max(32),
  email: z.string().max(160).optional().or(z.literal("")),
  company: z.string().max(120).optional(),
  occasion: z.string().max(120).optional(),
  seatingPreference: z.string().max(120).optional(),
  specialRequest: z.string().max(500).optional(),
  termsAccepted: z.literal(true),
  marketingConsent: z.boolean().optional().default(false),
  startedAt: z.number().int().positive(),
  website: z.string().max(0).optional(),
});

type RequestEvent = { requestId: string; type: string; actor: "guest" | "staff" | "system"; message?: string; createdAt: string };
type AccessToken = { requestId: string; tokenHash: string; revokedAt?: string; lastUsedAt?: string };
type IdempotentResponse = { request: PublicRequestRecord; token: string };

const now = new Date();
const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const tomorrow = new Date(now.getTime() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const seededRequests: PublicRequestRecord[] = [
  {
    id: "pr-1001", reference: "WFR-2026-1042", requestType: "main_dining", date: today, time: "18:30", durationMinutes: 120,
    guestCount: 4, fullName: "Sofia Ramirez", mobile: "0917 204 8812", mobileNormalized: "+639172048812", email: "sofia@example.com", emailNormalized: "sofia@example.com",
    occasion: "Birthday dinner", seatingPreference: "Window if available", specialRequest: "One guest uses a wheelchair.", termsAccepted: true, marketingConsent: false, startedAt: Date.now() - 9_000,
    status: "submitted", availabilitySnapshot: "available", currentAvailability: "available", depositExpected: false, submittedAt: new Date(Date.now() - 32 * 60_000).toISOString(), likelyDuplicate: false,
    termsVersion: previewPublicPolicy.termsVersion, privacyVersion: previewPublicPolicy.privacyVersion,
  },
  {
    id: "pr-1002", reference: "WFR-2026-1041", requestType: "vip_room", date: tomorrow, time: "18:00", durationMinutes: 240,
    guestCount: 18, fullName: "Marco Tan", mobile: "0918 555 0211", mobileNormalized: "+639185550211", email: "marco@northstar.ph", emailNormalized: "marco@northstar.ph", company: "Northstar Foods",
    occasion: "Board dinner", specialRequest: "AV screen requested.", termsAccepted: true, marketingConsent: false, startedAt: Date.now() - 9_000,
    status: "under_review", availabilitySnapshot: "requires_staff_review", currentAvailability: "requires_staff_review", depositExpected: true, submittedAt: new Date(Date.now() - 95 * 60_000).toISOString(), firstReviewedAt: new Date(Date.now() - 50 * 60_000).toISOString(), assignedOwner: "Mika Reyes", likelyDuplicate: false,
    termsVersion: previewPublicPolicy.termsVersion, privacyVersion: previewPublicPolicy.privacyVersion,
  },
  {
    id: "pr-1003", reference: "WFR-2026-1039", requestType: "main_dining", date: tomorrow, time: "19:30", durationMinutes: 150,
    guestCount: 12, fullName: "Adrian Lim", mobile: "0918 322 4410", mobileNormalized: "+639183224410", email: "adrian@example.com", emailNormalized: "adrian@example.com",
    occasion: "Team dinner", termsAccepted: true, marketingConsent: false, startedAt: Date.now() - 9_000,
    status: "alternative_proposed", availabilitySnapshot: "limited", currentAvailability: "unavailable", depositExpected: true, submittedAt: new Date(Date.now() - 4.5 * 3_600_000).toISOString(), firstReviewedAt: new Date(Date.now() - 4 * 3_600_000).toISOString(), assignedOwner: "Paolo Cruz", proposedAlternative: `${tomorrow} at 20:30`, guestMessage: "We can accommodate your party at 8:30 PM.", likelyDuplicate: true,
    termsVersion: previewPublicPolicy.termsVersion, privacyVersion: previewPublicPolicy.privacyVersion,
  },
  {
    id: "pr-1004", reference: "WFR-2026-1036", requestType: "private_event", date: tomorrow, time: "17:00", endTime: "22:00", durationMinutes: 300,
    guestCount: 80, fullName: "Leah de Leon", mobile: "0920 844 1200", mobileNormalized: "+639208441200", email: "leah@harborco.ph", emailNormalized: "leah@harborco.ph", company: "Harbor & Co.",
    occasion: "Company anniversary", specialRequest: "Cocktail reception followed by dinner.", termsAccepted: true, marketingConsent: false, startedAt: Date.now() - 9_000,
    status: "more_information_required", availabilitySnapshot: "requires_staff_review", currentAvailability: "requires_staff_review", depositExpected: true, submittedAt: new Date(Date.now() - 26 * 3_600_000).toISOString(), firstReviewedAt: new Date(Date.now() - 22 * 3_600_000).toISOString(), assignedOwner: "Mika Reyes", guestMessage: "Please confirm your preferred room layout and billing contact.", likelyDuplicate: false,
    termsVersion: previewPublicPolicy.termsVersion, privacyVersion: previewPublicPolicy.privacyVersion,
  },
];

const requests = new Map(seededRequests.map((request) => [request.id, request]));
const events: RequestEvent[] = seededRequests.map((request) => ({ requestId: request.id, type: "submitted", actor: "guest", createdAt: request.submittedAt }));
const accessTokens = new Map<string, AccessToken>();
const idempotency = new Map<string, IdempotentResponse>();
const submissionLimiter = new SlidingWindowRateLimit(5, 10 * 60_000);

export function listPublicRequests() {
  return [...requests.values()].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export function getRequestEvents(requestId: string) {
  return events.filter((event) => event.requestId === requestId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function submitPublicRequest(raw: unknown, idempotencyKey: string, rateKey: string): IdempotentResponse {
  if (idempotencyKey && idempotency.has(idempotencyKey)) return idempotency.get(idempotencyKey)!;
  const limit = submissionLimiter.check(rateKey);
  if (!limit.allowed) throw new Error("RATE_LIMITED");
  const input = requestSchema.parse(raw) as PublicRequestInput;
  const mobileNormalized = normalizePhilippineMobile(input.mobile);
  if (!mobileNormalized) throw new Error("INVALID_MOBILE");
  if (input.email && !normalizeEmail(input.email)) throw new Error("INVALID_EMAIL");
  if (input.marketingConsent && !normalizeEmail(input.email)) throw new Error("MARKETING_EMAIL_REQUIRED");
  if (input.website || Date.now() - input.startedAt < 1_500) throw new Error("BOT_CHECK_FAILED");
  const availability = publicAvailabilityFor(input);
  if (availability.state === "unavailable") throw new Error("UNAVAILABLE");
  const fingerprint = duplicateFingerprint(input);
  const likelyDuplicate = [...requests.values()].some((request) => duplicateFingerprint(request) === fingerprint && Date.now() - new Date(request.submittedAt).getTime() < 24 * 3_600_000);
  const id = crypto.randomUUID();
  const request: PublicRequestRecord = {
    ...input, id, reference: createRequestReference(requests.size + 1043), mobileNormalized, emailNormalized: normalizeEmail(input.email),
    status: "submitted", availabilitySnapshot: availability.state, currentAvailability: availability.state, depositExpected: availability.depositExpected,
    submittedAt: new Date().toISOString(), likelyDuplicate, termsVersion: previewPublicPolicy.termsVersion, privacyVersion: previewPublicPolicy.privacyVersion,
  };
  requests.set(id, request);
  events.push({ requestId: id, type: "submitted", actor: "guest", message: "Request received for staff review.", createdAt: request.submittedAt });
  const token = createManageToken();
  accessTokens.set(hashManageToken(token), { requestId: id, tokenHash: hashManageToken(token) });
  const response = { request, token };
  if (request.email) {
    const email = requestReceivedEmail(request.fullName, request.reference, `/reserve/manage/${token}`);
    void emailAdapter().send({ ...email, recipient: request.email });
  }
  if (idempotencyKey) idempotency.set(idempotencyKey, response);
  return response;
}

export function requestForManageToken(token: string) {
  const access = accessTokens.get(hashManageToken(token));
  if (!access || access.revokedAt) return null;
  access.lastUsedAt = new Date().toISOString();
  const request = requests.get(access.requestId);
  return request ? { request, events: getRequestEvents(request.id) } : null;
}

export function guestManageAction(token: string, action: string, details?: string) {
  const managed = requestForManageToken(token);
  if (!managed) throw new Error("INVALID_TOKEN");
  const request = managed.request;
  if (action === "withdraw") {
    if (request.status === "withdrawn_by_guest") return request;
    if (!canTransitionPublicRequest(request.status, "withdrawn_by_guest")) throw new Error("ACTION_NOT_ALLOWED");
    request.status = "withdrawn_by_guest";
    request.resolvedAt = new Date().toISOString();
  } else if (action === "provide_information") {
    if (request.status !== "more_information_required") throw new Error("ACTION_NOT_ALLOWED");
    request.status = "under_review";
    request.guestMessage = details?.slice(0, 500);
  } else if (action === "accept_alternative") {
    if (request.status !== "alternative_proposed") throw new Error("ACTION_NOT_ALLOWED");
    request.status = "under_review";
    request.guestMessage = "Guest accepted the proposed alternative. Final staff conversion is still required.";
  } else if (action === "cancel" || action === "reschedule") {
    if (request.status !== "approved_converted") throw new Error("ACTION_NOT_ALLOWED");
    request.guestMessage = `${action === "cancel" ? "Cancellation" : "Reschedule"} request submitted: ${details?.slice(0, 400) ?? "No details"}`;
  } else throw new Error("ACTION_NOT_ALLOWED");
  events.push({ requestId: request.id, type: action, actor: "guest", message: request.guestMessage, createdAt: new Date().toISOString() });
  return request;
}

export type StaffRequestAction = "start_review" | "request_information" | "propose_alternative" | "decline" | "mark_duplicate" | "convert" | "assign";

export function staffRequestAction(requestId: string, action: StaffRequestAction, details?: { message?: string; alternative?: string; owner?: string; reason?: string }) {
  const request = requests.get(requestId);
  if (!request) throw new Error("NOT_FOUND");
  const eventAt = new Date().toISOString();
  if (action === "assign") request.assignedOwner = details?.owner || "Mika Reyes";
  if (action === "start_review") {
    if (request.status === "submitted") request.status = "under_review";
    request.firstReviewedAt ??= eventAt;
    request.assignedOwner ??= "Mika Reyes";
  }
  if (action === "request_information") {
    if (!canTransitionPublicRequest(request.status, "more_information_required")) throw new Error("INVALID_TRANSITION");
    request.status = "more_information_required";
    request.guestMessage = details?.message || "Please provide a little more information so our team can review your request.";
  }
  if (action === "propose_alternative") {
    if (request.status !== "alternative_proposed" && !canTransitionPublicRequest(request.status, "alternative_proposed")) throw new Error("INVALID_TRANSITION");
    request.status = "alternative_proposed";
    request.proposedAlternative = details?.alternative || `${request.date} at 20:30`;
    request.guestMessage = details?.message || "We can offer an alternative schedule for your request.";
  }
  if (action === "decline" || action === "mark_duplicate") {
    const next: PublicRequestStatus = action === "decline" ? "declined" : "closed_duplicate";
    if (!canTransitionPublicRequest(request.status, next)) throw new Error("INVALID_TRANSITION");
    request.status = next;
    request.reasonCategory = details?.reason || (action === "decline" ? "No availability" : "Duplicate request");
    request.resolvedAt = eventAt;
  }
  let reservation: Reservation | undefined;
  if (action === "convert") {
    if (request.status === "approved_converted" || request.linkedReservationId) throw new Error("ALREADY_CONVERTED");
    if (!["under_review", "more_information_required", "alternative_proposed"].includes(request.status)) throw new Error("REVIEW_REQUIRED");
    if (request.currentAvailability === "unavailable") throw new Error("STALE_AVAILABILITY");
    const reservationId = crypto.randomUUID();
    reservation = {
      id: reservationId, code: `WF-${request.date.replaceAll("-", "").slice(2)}-${String(requests.size + 20).padStart(3, "0")}`,
      guestName: request.fullName, guestCount: request.guestCount, mobile: request.mobileNormalized, email: request.email,
      bookingType: request.requestType === "main_dining" ? request.guestCount >= 10 ? "large_party" : "regular_table" : request.requestType,
      area: request.requestType === "main_dining" ? "Main Dining" : request.requestType === "vip_room" ? "VIP Room" : "Whole Restaurant",
      date: request.date, start: request.time, durationMinutes: request.durationMinutes,
      status: request.depositExpected ? "pending_deposit" : "pending_confirmation", source: "Website", deposit: request.depositExpected ? "pending" : "not_required", occasion: request.occasion, owner: request.assignedOwner ?? "Mika Reyes",
    };
    request.status = "approved_converted";
    request.linkedReservationId = reservationId;
    request.linkedReservationCode = reservation.code;
    request.resolvedAt = eventAt;
  }
  events.push({ requestId, type: action, actor: "staff", message: details?.message, createdAt: eventAt });
  return { request, reservation, events: getRequestEvents(requestId) };
}
