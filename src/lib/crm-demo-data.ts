import type { Reservation } from "./domain";
import type { ConsentEvent, CrmGuest, SegmentRule } from "./crm-marketing";

const waterfrontScope = { scopeType: "outlet" as const, scopeId: "waterfront-seafood-iloilo" };

function emailConsent(guestId: string, contactPointId: string, status: ConsentEvent["status"], capturedAt: string): ConsentEvent {
  return {
    id: `consent-${guestId}-${status}-${capturedAt}`,
    guestId,
    contactPointId,
    purpose: "marketing",
    channel: "email",
    ...waterfrontScope,
    status,
    textVersion: status === "granted" ? "waterfront-marketing-preview-2026-08" : undefined,
    evidenceHash: status === "granted" ? `demo-evidence-${guestId}` : undefined,
    captureSource: status === "granted" ? "public_booking_form" : "guest_preference_center",
    capturedAt,
  };
}

export const demoCrmGuests: CrmGuest[] = [
  {
    id: "guest-camille",
    fullName: "Camille Santos",
    preferredName: "Camille",
    status: "active",
    contactPoints: [
      { id: "contact-camille-email", guestId: "guest-camille", channel: "email", displayValue: "camille@example.com", normalizedValue: "camille@example.com", state: "verified", primary: true },
      { id: "contact-camille-mobile", guestId: "guest-camille", channel: "mobile", displayValue: "+63 917 555 0124", normalizedValue: "+639175550124", state: "unverified", primary: true },
    ],
    consentEvents: [emailConsent("guest-camille", "contact-camille-email", "granted", "2026-07-18T04:12:00.000Z")],
    suppressions: [],
    tags: ["Frequent Diner", "Birthday"],
  },
  {
    id: "guest-adrian",
    fullName: "Adrian Lim",
    status: "active",
    company: "Northstar Foods",
    contactPoints: [
      { id: "contact-adrian-email", guestId: "guest-adrian", channel: "email", displayValue: "adrian@example.com", normalizedValue: "adrian@example.com", state: "unverified", primary: true },
      { id: "contact-adrian-mobile", guestId: "guest-adrian", channel: "mobile", displayValue: "+63 918 322 4410", normalizedValue: "+639183224410", state: "unverified", primary: true },
    ],
    consentEvents: [emailConsent("guest-adrian", "contact-adrian-email", "unknown", "2026-07-10T03:00:00.000Z")],
    suppressions: [],
    tags: ["Corporate Guest"],
  },
  {
    id: "guest-adrian-duplicate",
    fullName: "Adrian C. Lim",
    status: "active",
    contactPoints: [
      { id: "contact-adrian-duplicate-mobile", guestId: "guest-adrian-duplicate", channel: "mobile", displayValue: "0918 322 4410", normalizedValue: "+639183224410", state: "unverified", primary: true },
    ],
    consentEvents: [],
    suppressions: [],
    tags: [],
  },
  {
    id: "guest-isabel",
    fullName: "Isabel Villanueva",
    preferredName: "Isabel",
    status: "active",
    contactPoints: [
      { id: "contact-isabel-email", guestId: "guest-isabel", channel: "email", displayValue: "isabel@example.com", normalizedValue: "isabel@example.com", state: "complained", primary: true },
      { id: "contact-isabel-whatsapp", guestId: "guest-isabel", channel: "whatsapp", displayValue: "+63 917 810 9098", normalizedValue: "+639178109098", state: "verified", primary: true },
    ],
    consentEvents: [emailConsent("guest-isabel", "contact-isabel-email", "granted", "2026-05-02T08:00:00.000Z")],
    suppressions: [{ id: "suppression-isabel", guestId: "guest-isabel", contactPointId: "contact-isabel-email", purpose: "marketing", channel: "email", reason: "complaint", effectiveAt: "2026-07-28T01:15:00.000Z" }],
    tags: ["VIP"],
  },
  {
    id: "guest-grace",
    fullName: "Grace Ong",
    status: "active",
    contactPoints: [
      { id: "contact-grace-email", guestId: "guest-grace", channel: "email", displayValue: "grace@example.com", normalizedValue: "grace@example.com", state: "verified", primary: true },
      { id: "contact-grace-mobile", guestId: "guest-grace", channel: "mobile", displayValue: "+63 920 448 1299", normalizedValue: "+639204481299", state: "unverified", primary: true },
    ],
    consentEvents: [
      emailConsent("guest-grace", "contact-grace-email", "granted", "2026-06-01T02:00:00.000Z"),
      emailConsent("guest-grace", "contact-grace-email", "withdrawn", "2026-07-30T10:25:00.000Z"),
    ],
    suppressions: [{ id: "suppression-grace", guestId: "guest-grace", contactPointId: "contact-grace-email", purpose: "marketing", channel: "email", ...waterfrontScope, reason: "unsubscribe", effectiveAt: "2026-07-30T10:25:00.000Z" }],
    tags: ["Frequent Diner"],
  },
];

function history(id: string, guestName: string, date: string, status: Reservation["status"], guestCount: number, source = "Website"): Reservation {
  return { id, code: `WF-HISTORY-${id}`, guestName, guestCount, mobile: "+639000000000", bookingType: "regular_table", area: "Main Dining", date, start: "18:00", durationMinutes: 120, status, source, deposit: "not_required" };
}

export const demoGuestHistory: Record<string, Reservation[]> = {
  "guest-camille": [
    history("C1", "Camille Santos", "2026-03-14", "completed", 4, "Instagram"),
    history("C2", "Camille Santos", "2026-05-22", "completed", 2, "Website"),
    history("C3", "Camille Santos", "2026-07-18", "completed", 5, "Website"),
    history("C4", "Camille Santos", "2026-08-07", "confirmed", 4, "Instagram"),
  ],
  "guest-adrian": [history("A1", "Adrian Lim", "2026-06-20", "completed", 10, "Facebook Messenger"), history("A2", "Adrian Lim", "2026-08-07", "pending_deposit", 12)],
  "guest-adrian-duplicate": [history("AD1", "Adrian C. Lim", "2026-02-12", "completed", 4, "Phone")],
  "guest-isabel": [history("I1", "Isabel Villanueva", "2026-04-02", "completed", 6, "Phone"), history("I2", "Isabel Villanueva", "2026-08-07", "confirmed", 6)],
  "guest-grace": [history("G1", "Grace Ong", "2026-01-28", "completed", 4, "Viber"), history("G2", "Grace Ong", "2026-07-10", "no_show", 2, "Viber"), history("G3", "Grace Ong", "2026-08-07", "confirmed", 8, "Viber")],
};

export type DemoSegment = { id: string; name: string; version: number; description: string; rules: SegmentRule[]; estimated: number; exact: number; updatedAt: string };

export const demoSegments: DemoSegment[] = [
  { id: "segment-returning", name: "Recent returning diners", version: 3, description: "Waterfront email-eligible guests with 2+ completed visits.", rules: [{ field: "scope", operator: "equals", value: "Waterfront Seafood" }, { field: "channel_eligibility", operator: "equals", value: "email" }, { field: "completed_visit_count", operator: "greater_than", value: 1 }], estimated: 128, exact: 0, updatedAt: "2026-08-07T06:10:00.000Z" },
  { id: "segment-birthday", name: "September occasions", version: 1, description: "Manual occasion audience; eligibility is still applied outside the rules.", rules: [{ field: "important_date_month", operator: "equals", value: 9 }], estimated: 42, exact: 0, updatedAt: "2026-08-06T02:30:00.000Z" },
];

export type DemoCampaign = {
  id: string;
  name: string;
  channel: "email" | "whatsapp";
  status: "draft" | "content_review" | "audience_review" | "approved" | "scheduled" | "paused" | "completed";
  version: number;
  segmentId: string;
  creator: string;
  creatorId: string;
  approver?: string;
  approverId?: string;
  subject: string;
  body: string;
  eligible: number;
  excluded: { unknownConsent: number; suppressed: number; invalidContact: number; frequency: number; deduplicated: number };
  scheduledFor?: string;
};

export const demoCampaigns: DemoCampaign[] = [
  {
    id: "campaign-harbor-evenings", name: "Harbor Evenings · September", channel: "email", status: "audience_review", version: 4,
    segmentId: "segment-returning", creator: "Ana Villanueva", creatorId: "marketing-ana", subject: "A September evening by the river",
    body: "Hello {{preferred_name}}, discover September evenings at {{outlet_name}}. Manage your choices: {{preference_url}}",
    eligible: 0, excluded: { unknownConsent: 89, suppressed: 14, invalidContact: 7, frequency: 0, deduplicated: 3 },
  },
  {
    id: "campaign-brunch", name: "Sunday Brunch Preview", channel: "email", status: "draft", version: 1,
    segmentId: "segment-birthday", creator: "Mika Reyes", creatorId: "manager-mika", subject: "A first look at Sunday brunch",
    body: "Hello {{preferred_name}}, a new Sunday service is coming to {{outlet_name}}.",
    eligible: 0, excluded: { unknownConsent: 42, suppressed: 0, invalidContact: 0, frequency: 0, deduplicated: 0 },
  },
  {
    id: "campaign-whatsapp", name: "WhatsApp concept test", channel: "whatsapp", status: "draft", version: 1,
    segmentId: "segment-returning", creator: "Ana Villanueva", creatorId: "marketing-ana", subject: "Approved template required", body: "Template preview only.",
    eligible: 0, excluded: { unknownConsent: 128, suppressed: 0, invalidContact: 0, frequency: 0, deduplicated: 0 },
  },
];

export const demoPreferenceToken = "wf_pref_demo_2026_camille_6Yx4mQ2p";
