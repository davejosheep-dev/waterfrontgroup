import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { normalizeEmail, normalizePhilippineMobile, TIMEZONE, type Reservation } from "./domain";

export type ContactChannel = "email" | "mobile" | "whatsapp";
export type MarketingChannel = "email" | "whatsapp";
export type ConsentStatus = "granted" | "withdrawn" | "objected" | "unknown" | "not_applicable";
export type ScopeType = "outlet" | "brand" | "group";
export type GuestStatus = "active" | "merged" | "anonymized" | "restricted" | "deceased";
export type ContactState = "unverified" | "verified" | "invalid" | "bounced" | "complained" | "retired";

export type GuestContactPoint = {
  id: string;
  guestId: string;
  channel: ContactChannel;
  displayValue: string;
  normalizedValue: string;
  state: ContactState;
  primary: boolean;
};

export type ConsentEvent = {
  id: string;
  guestId: string;
  contactPointId: string;
  purpose: "marketing" | "transactional";
  channel: MarketingChannel;
  scopeType: ScopeType;
  scopeId: string;
  status: ConsentStatus;
  textVersion?: string;
  evidenceHash?: string;
  captureSource: string;
  capturedAt: string;
  supersedesId?: string;
};

export type Suppression = {
  id: string;
  guestId: string;
  contactPointId?: string;
  purpose: "marketing";
  channel?: MarketingChannel;
  scopeType?: ScopeType;
  scopeId?: string;
  reason: "unsubscribe" | "objection" | "hard_bounce" | "complaint" | "invalid" | "privacy_restriction" | "manual";
  effectiveAt: string;
  liftedAt?: string;
};

export type CrmGuest = {
  id: string;
  fullName: string;
  preferredName?: string;
  company?: string;
  status: GuestStatus;
  mergedIntoGuestId?: string;
  contactPoints: GuestContactPoint[];
  consentEvents: ConsentEvent[];
  suppressions: Suppression[];
  tags: string[];
};

export type MatchCandidate = {
  guestId: string;
  reasons: Array<"exact_mobile" | "exact_email" | "compatible_name" | "similar_name_only">;
  confidence: "strong" | "moderate" | "weak";
  autoMergeAllowed: false;
};

export type EligibilityReason =
  | "eligible"
  | "guest_restricted"
  | "contact_invalid"
  | "privacy_restriction"
  | "guest_objection"
  | "contact_suppressed"
  | "consent_missing_or_unknown"
  | "consent_scope_mismatch"
  | "campaign_excluded"
  | "frequency_policy_unapproved"
  | "frequency_cap_reached"
  | "quiet_hours"
  | "duplicate_recipient";

export type EligibilityResult = { eligible: boolean; code: EligibilityReason; explanation: string };

const explanation: Record<EligibilityReason, string> = {
  eligible: "Eligible after consent, contact, suppression, scope, frequency, quiet-hour, and deduplication checks.",
  guest_restricted: "The guest profile is not active for marketing.",
  contact_invalid: "The selected contact point is invalid, bounced, complained, or retired.",
  privacy_restriction: "An organization or guest privacy restriction blocks marketing.",
  guest_objection: "A guest objection or unsubscribe overrides prior consent.",
  contact_suppressed: "The channel or contact point is suppressed.",
  consent_missing_or_unknown: "No current, evidenced marketing consent exists for this channel.",
  consent_scope_mismatch: "Consent exists only for a different Waterfront scope.",
  campaign_excluded: "The guest matches a campaign exclusion.",
  frequency_policy_unapproved: "Waterfront has not approved a production frequency policy.",
  frequency_cap_reached: "The approved marketing frequency cap has been reached.",
  quiet_hours: "The send would fall inside configured quiet hours in Asia/Manila.",
  duplicate_recipient: "This normalized recipient is already present in the approved campaign version.",
};

function result(code: EligibilityReason): EligibilityResult {
  return { eligible: code === "eligible", code, explanation: explanation[code] };
}

function normalizedName(value: string) {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchGuestCandidates(
  input: { fullName: string; mobile?: string; email?: string },
  guests: CrmGuest[],
): MatchCandidate[] {
  const mobile = input.mobile ? normalizePhilippineMobile(input.mobile) : null;
  const email = normalizeEmail(input.email);
  const name = normalizedName(input.fullName);

  return guests.flatMap<MatchCandidate>((guest) => {
    if (guest.status === "merged") return [];
    const reasons: MatchCandidate["reasons"] = [];
    if (mobile && guest.contactPoints.some((point) => point.channel !== "email" && point.normalizedValue === mobile)) reasons.push("exact_mobile");
    if (email && guest.contactPoints.some((point) => point.channel === "email" && point.normalizedValue === email)) reasons.push("exact_email");
    const sameName = name.length > 1 && normalizedName(guest.fullName) === name;
    if ((reasons.length > 0) && sameName) reasons.push("compatible_name");
    if (reasons.length === 0 && sameName) reasons.push("similar_name_only");
    if (reasons.length === 0) return [];
    const confidence: MatchCandidate["confidence"] = reasons.includes("exact_mobile") ? "strong" : reasons.includes("exact_email") ? "moderate" : "weak";
    return [{
      guestId: guest.id,
      reasons,
      confidence,
      autoMergeAllowed: false as const,
    }];
  }).sort((a, b) => {
    const rank = { strong: 0, moderate: 1, weak: 2 } as const;
    return rank[a.confidence] - rank[b.confidence];
  });
}

export function currentConsent(
  events: ConsentEvent[],
  target: Pick<ConsentEvent, "guestId" | "contactPointId" | "purpose" | "channel" | "scopeType" | "scopeId">,
): ConsentEvent | null {
  return events
    .filter((event) => event.guestId === target.guestId
      && event.contactPointId === target.contactPointId
      && event.purpose === target.purpose
      && event.channel === target.channel
      && event.scopeType === target.scopeType
      && event.scopeId === target.scopeId)
    .toSorted((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0] ?? null;
}

export function mergeGuestProfiles(survivor: CrmGuest, duplicate: CrmGuest, reason: string, mergedAt = new Date()) {
  if (survivor.id === duplicate.id) throw new Error("A guest cannot be merged into the same profile.");
  if (reason.trim().length < 8) throw new Error("A meaningful merge reason is required.");

  const contactMap = new Map<string, string>();
  const contacts = survivor.contactPoints.map((point) => ({ ...point }));
  for (const point of duplicate.contactPoints) {
    const existing = contacts.find((candidate) => candidate.channel === point.channel && candidate.normalizedValue === point.normalizedValue);
    if (existing) contactMap.set(point.id, existing.id);
    else {
      const next = { ...point, guestId: survivor.id, primary: false };
      contacts.push(next);
      contactMap.set(point.id, next.id);
    }
  }

  const rewrittenDuplicateEvents = duplicate.consentEvents.map((event) => ({
    ...event,
    guestId: survivor.id,
    contactPointId: contactMap.get(event.contactPointId) ?? event.contactPointId,
  }));
  const consentEvents = [...survivor.consentEvents.map((event) => ({ ...event })), ...rewrittenDuplicateEvents];
  const grouped = new Map<string, ConsentEvent[]>();
  for (const event of consentEvents) {
    const key = [event.contactPointId, event.purpose, event.channel, event.scopeType, event.scopeId].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }
  for (const [key, events] of grouped) {
    const negative = events.some((event) => event.status === "objected") ? "objected"
      : events.some((event) => event.status === "withdrawn") ? "withdrawn" : null;
    if (negative && events.some((event) => event.status === "granted")) {
      const latest = events.toSorted((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
      consentEvents.push({
        ...latest,
        id: `merge-consent-${survivor.id}-${key}`,
        guestId: survivor.id,
        status: negative,
        textVersion: undefined,
        evidenceHash: undefined,
        captureSource: "reviewed_guest_merge",
        capturedAt: mergedAt.toISOString(),
        supersedesId: latest.id,
      });
    }
  }

  const suppressions = [
    ...survivor.suppressions.map((item) => ({ ...item })),
    ...duplicate.suppressions.map((item) => ({
      ...item,
      guestId: survivor.id,
      contactPointId: item.contactPointId ? contactMap.get(item.contactPointId) ?? item.contactPointId : undefined,
    })),
  ];

  return {
    survivor: {
      ...survivor,
      contactPoints: contacts,
      consentEvents,
      suppressions,
      tags: [...new Set([...survivor.tags, ...duplicate.tags])],
    },
    tombstone: { ...duplicate, status: "merged" as const, mergedIntoGuestId: survivor.id, contactPoints: [], consentEvents: [], suppressions: [], tags: [] },
    event: { survivorId: survivor.id, mergedGuestId: duplicate.id, reason: reason.trim(), mergedAt: mergedAt.toISOString() },
  };
}

function activeSuppressions(input: {
  guest: CrmGuest;
  contact: GuestContactPoint;
  channel: MarketingChannel;
  scopeType: ScopeType;
  scopeId: string;
}) {
  return input.guest.suppressions.filter((suppression) => !suppression.liftedAt
    && suppression.purpose === "marketing"
    && (!suppression.contactPointId || suppression.contactPointId === input.contact.id)
    && (!suppression.channel || suppression.channel === input.channel)
    && (!suppression.scopeType || suppression.scopeType === input.scopeType)
    && (!suppression.scopeId || suppression.scopeId === input.scopeId));
}

export function isQuietHour(at: Date, quietStartHour: number, quietEndHour: number, timezone = TIMEZONE) {
  const localHour = toZonedTime(at, timezone).getHours();
  if (quietStartHour === quietEndHour) return false;
  return quietStartHour < quietEndHour
    ? localHour >= quietStartHour && localHour < quietEndHour
    : localHour >= quietStartHour || localHour < quietEndHour;
}

export function marketingEligibility(input: {
  guest: CrmGuest;
  contact: GuestContactPoint;
  channel: MarketingChannel;
  scopeType: ScopeType;
  scopeId: string;
  now: Date;
  campaignExcluded?: boolean;
  frequencyPolicyApproved: boolean;
  sendsInWindow?: number;
  frequencyCap?: number;
  quietHours?: { startHour: number; endHour: number };
  normalizedRecipients?: Set<string>;
}): EligibilityResult {
  const { guest, contact } = input;
  if (guest.status !== "active") return result("guest_restricted");
  if (["invalid", "bounced", "complained", "retired"].includes(contact.state)) return result("contact_invalid");

  const suppressions = activeSuppressions(input);
  if (suppressions.some((item) => item.reason === "privacy_restriction")) return result("privacy_restriction");
  if (suppressions.some((item) => ["objection", "unsubscribe"].includes(item.reason))) return result("guest_objection");
  if (suppressions.length > 0) return result("contact_suppressed");

  const consent = currentConsent(guest.consentEvents, {
    guestId: guest.id,
    contactPointId: contact.id,
    purpose: "marketing",
    channel: input.channel,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
  });
  if (!consent) {
    const differentScope = guest.consentEvents.some((event) => event.guestId === guest.id
      && event.contactPointId === contact.id && event.purpose === "marketing" && event.channel === input.channel && event.status === "granted");
    return result(differentScope ? "consent_scope_mismatch" : "consent_missing_or_unknown");
  }
  if (consent.status !== "granted" || !consent.textVersion || !consent.evidenceHash) return result("consent_missing_or_unknown");
  if (input.campaignExcluded) return result("campaign_excluded");
  if (!input.frequencyPolicyApproved) return result("frequency_policy_unapproved");
  if (input.frequencyCap !== undefined && (input.sendsInWindow ?? 0) >= input.frequencyCap) return result("frequency_cap_reached");
  if (input.quietHours && isQuietHour(input.now, input.quietHours.startHour, input.quietHours.endHour)) return result("quiet_hours");
  if (input.normalizedRecipients?.has(contact.normalizedValue)) return result("duplicate_recipient");
  return result("eligible");
}

export type GuestMetrics = {
  firstReservationDate?: string;
  firstCompletedVisitDate?: string;
  lastCompletedVisitDate?: string;
  upcomingReservationCount: number;
  completedVisitCount: number;
  cancellationCount: number;
  noShowCount: number;
  averagePartySize: number;
  maximumPartySize: number;
  asOf: string;
  definition: string;
};

export function calculateGuestMetrics(reservations: Reservation[], now = new Date()): GuestMetrics {
  const ordered = reservations.toSorted((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  const completed = ordered.filter((reservation) => reservation.status === "completed");
  const future = ordered.filter((reservation) => fromZonedTime(`${reservation.date}T${reservation.start}:00`, TIMEZONE) >= now
    && !["cancelled", "no_show", "expired"].includes(reservation.status));
  const sum = ordered.reduce((total, reservation) => total + reservation.guestCount, 0);
  return {
    firstReservationDate: ordered[0]?.date,
    firstCompletedVisitDate: completed[0]?.date,
    lastCompletedVisitDate: completed.at(-1)?.date,
    upcomingReservationCount: future.length,
    completedVisitCount: completed.length,
    cancellationCount: ordered.filter((reservation) => reservation.status === "cancelled").length,
    noShowCount: ordered.filter((reservation) => reservation.status === "no_show").length,
    averagePartySize: ordered.length ? Math.round((sum / ordered.length) * 10) / 10 : 0,
    maximumPartySize: ordered.reduce((maximum, reservation) => Math.max(maximum, reservation.guestCount), 0),
    asOf: now.toISOString(),
    definition: "Visits count only reservations in the completed state; deposit values are excluded.",
  };
}

export type SegmentField = "scope" | "channel_eligibility" | "last_completed_visit" | "completed_visit_count" | "upcoming_reservation" | "booking_type" | "reservation_source" | "occasion" | "important_date_month" | "party_size" | "tag" | "campaign_state" | "excluded_segment";
export type SegmentRule = { field: string; operator: string; value: string | number | boolean | string[] };

const operators: Record<SegmentField, string[]> = {
  scope: ["equals"], channel_eligibility: ["equals"], last_completed_visit: ["before", "after", "between"],
  completed_visit_count: ["equals", "greater_than", "less_than", "between"], upcoming_reservation: ["equals"],
  booking_type: ["equals", "in"], reservation_source: ["equals", "in"], occasion: ["equals", "in"],
  important_date_month: ["equals", "in"], party_size: ["greater_than", "less_than", "between"], tag: ["equals", "in"],
  campaign_state: ["equals", "in"], excluded_segment: ["equals"],
};

export function validateSegmentRules(rules: SegmentRule[]) {
  const errors = rules.flatMap((rule, index) => {
    if (!(rule.field in operators)) return [`Rule ${index + 1}: ${rule.field} is not an approved segmentation field.`];
    if (!operators[rule.field as SegmentField].includes(rule.operator)) return [`Rule ${index + 1}: ${rule.operator} is not allowed for ${rule.field}.`];
    return [];
  });
  return { valid: errors.length === 0, errors };
}

export type CampaignStatus = "draft" | "content_review" | "audience_review" | "approved" | "scheduled" | "sending" | "paused" | "completed" | "cancelled" | "failed";

const campaignTransitions: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["content_review", "cancelled"], content_review: ["draft", "audience_review", "cancelled"],
  audience_review: ["draft", "approved", "cancelled"], approved: ["draft", "scheduled", "cancelled"],
  scheduled: ["sending", "paused", "cancelled"], sending: ["paused", "completed", "failed", "cancelled"],
  paused: ["scheduled", "sending", "cancelled"], completed: [], cancelled: [], failed: ["paused", "cancelled"],
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus) {
  return campaignTransitions[from].includes(to);
}

export function canApproveCampaign(creatorId: string, approverId: string) {
  return creatorId !== approverId;
}

export function approvalAfterEdit(status: CampaignStatus, changed: boolean) {
  return changed && ["approved", "scheduled", "paused"].includes(status) ? "draft" as const : status;
}

export function recipientIdempotencyKey(campaignId: string, version: number, channel: MarketingChannel, normalizedRecipient: string) {
  const value = `${campaignId}|${version}|${channel}|${normalizedRecipient}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `campaign-recipient-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const unsafeHtml = /<(script|style|form|iframe|object|embed|img)\b[^>]*>[\s\S]*?<\/\1>|<(script|style|form|iframe|object|embed|img)\b[^>]*\/?>/gi;
const unsafeAttributes = /\s(on\w+|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const unsafeProtocols = /(href\s*=\s*["'])\s*(javascript:|data:)/gi;

export function sanitizeMarketingHtml(value: string) {
  return value.replace(unsafeHtml, "").replace(unsafeAttributes, "").replace(unsafeProtocols, "$1#blocked-");
}

export function renderSafePersonalization(template: string, values: { preferredName?: string; outletName: string; preferenceUrl: string }) {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  return sanitizeMarketingHtml(template
    .replaceAll("{{preferred_name}}", escape(values.preferredName?.trim() || "Guest"))
    .replaceAll("{{outlet_name}}", escape(values.outletName))
    .replaceAll("{{preference_url}}", escape(values.preferenceUrl)));
}
