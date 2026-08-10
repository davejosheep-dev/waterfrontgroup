import { describe, expect, it } from "vitest";
import { demoCrmGuests, demoGuestHistory } from "./crm-demo-data";
import {
  approvalAfterEdit,
  calculateGuestMetrics,
  canApproveCampaign,
  canTransitionCampaign,
  currentConsent,
  isQuietHour,
  marketingEligibility,
  matchGuestCandidates,
  mergeGuestProfiles,
  recipientIdempotencyKey,
  renderSafePersonalization,
  sanitizeMarketingHtml,
  validateSegmentRules,
} from "./crm-marketing";

describe("guest CRM identity", () => {
  it("uses exact Philippine mobile as a strong, explainable suggestion without auto-merging", () => {
    const matches = matchGuestCandidates({ fullName: "A. Lim", mobile: "0918 322 4410" }, demoCrmGuests);
    expect(matches.filter((match) => match.reasons.includes("exact_mobile"))).toHaveLength(2);
    expect(matches[0]).toMatchObject({ confidence: "strong", autoMergeAllowed: false });
  });

  it("never permits a name-only automatic merge", () => {
    const matches = matchGuestCandidates({ fullName: "Grace Ong" }, demoCrmGuests);
    expect(matches).toEqual([expect.objectContaining({ reasons: ["similar_name_only"], confidence: "weak", autoMergeAllowed: false })]);
  });

  it("requires a reason and preserves the losing guest as a tombstone", () => {
    expect(() => mergeGuestProfiles(demoCrmGuests[1], demoCrmGuests[2], "same")).toThrow(/meaningful/i);
    const merged = mergeGuestProfiles(demoCrmGuests[1], demoCrmGuests[2], "Confirmed same guest by manager", new Date("2026-08-07T08:00:00Z"));
    expect(merged.tombstone).toMatchObject({ status: "merged", mergedIntoGuestId: "guest-adrian" });
    expect(merged.survivor.contactPoints.filter((point) => point.normalizedValue === "+639183224410")).toHaveLength(1);
  });

  it("keeps withdrawal stronger than a conflicting grant during merge", () => {
    const grantGuest = demoCrmGuests[0];
    const withdrawnGuest = {
      ...demoCrmGuests[4],
      contactPoints: demoCrmGuests[4].contactPoints.map((point) => point.channel === "email" ? { ...point, normalizedValue: "camille@example.com" } : point),
    };
    const merged = mergeGuestProfiles(grantGuest, withdrawnGuest, "Confirmed duplicate contact owner", new Date("2026-08-07T08:00:00Z"));
    const consent = currentConsent(merged.survivor.consentEvents, {
      guestId: grantGuest.id, contactPointId: "contact-camille-email", purpose: "marketing", channel: "email", scopeType: "outlet", scopeId: "waterfront-seafood-iloilo",
    });
    expect(consent?.status).toBe("withdrawn");
  });
});

describe("consent-first eligibility", () => {
  const base = { channel: "email" as const, scopeType: "outlet" as const, scopeId: "waterfront-seafood-iloilo", now: new Date("2026-08-07T06:00:00Z"), frequencyPolicyApproved: true };

  it("allows only a current evidenced consent for the requested scope", () => {
    const guest = demoCrmGuests[0];
    expect(marketingEligibility({ ...base, guest, contact: guest.contactPoints[0] }).code).toBe("eligible");
    expect(marketingEligibility({ ...base, guest, contact: guest.contactPoints[0], scopeId: "another-outlet" }).code).toBe("consent_scope_mismatch");
  });

  it("excludes unknown legacy consent", () => {
    const guest = demoCrmGuests[1];
    expect(marketingEligibility({ ...base, guest, contact: guest.contactPoints[0] }).code).toBe("consent_missing_or_unknown");
  });

  it("applies complaint and unsubscribe suppression ahead of consent", () => {
    const complained = demoCrmGuests[3];
    const withdrawn = demoCrmGuests[4];
    expect(marketingEligibility({ ...base, guest: complained, contact: complained.contactPoints[0] }).code).toBe("contact_invalid");
    expect(marketingEligibility({ ...base, guest: withdrawn, contact: withdrawn.contactPoints[0] }).code).toBe("guest_objection");
  });

  it("blocks production eligibility until management approves a frequency policy", () => {
    const guest = demoCrmGuests[0];
    expect(marketingEligibility({ ...base, frequencyPolicyApproved: false, guest, contact: guest.contactPoints[0] }).code).toBe("frequency_policy_unapproved");
  });

  it("checks frequency, Manila quiet hours, and duplicate recipients at send time", () => {
    const guest = demoCrmGuests[0];
    const contact = guest.contactPoints[0];
    expect(marketingEligibility({ ...base, guest, contact, sendsInWindow: 1, frequencyCap: 1 }).code).toBe("frequency_cap_reached");
    expect(marketingEligibility({ ...base, guest, contact, now: new Date("2026-08-07T15:30:00Z"), quietHours: { startHour: 21, endHour: 8 } }).code).toBe("quiet_hours");
    expect(marketingEligibility({ ...base, guest, contact, normalizedRecipients: new Set([contact.normalizedValue]) }).code).toBe("duplicate_recipient");
  });
});

describe("CRM metrics, segments, and campaigns", () => {
  it("counts visits only when reservations are completed", () => {
    const metrics = calculateGuestMetrics(demoGuestHistory["guest-camille"], new Date("2026-08-07T00:00:00Z"));
    expect(metrics.completedVisitCount).toBe(3);
    expect(metrics.upcomingReservationCount).toBe(1);
    expect(metrics.definition).toMatch(/completed state/i);
  });

  it("rejects restricted segment fields and invalid operators", () => {
    expect(validateSegmentRules([{ field: "allergies", operator: "contains", value: "shellfish" }])).toEqual(expect.objectContaining({ valid: false }));
    expect(validateSegmentRules([{ field: "completed_visit_count", operator: "contains", value: 2 }])).toEqual(expect.objectContaining({ valid: false }));
    expect(validateSegmentRules([{ field: "completed_visit_count", operator: "greater_than", value: 2 }])).toEqual({ valid: true, errors: [] });
  });

  it("enforces campaign lifecycle and maker-checker approval", () => {
    expect(canTransitionCampaign("audience_review", "approved")).toBe(true);
    expect(canTransitionCampaign("draft", "sending")).toBe(false);
    expect(canApproveCampaign("marketing-ana", "marketing-ana")).toBe(false);
    expect(canApproveCampaign("marketing-ana", "manager-mika")).toBe(true);
    expect(approvalAfterEdit("approved", true)).toBe("draft");
  });

  it("creates stable recipient idempotency keys", () => {
    const a = recipientIdempotencyKey("campaign-1", 2, "email", "guest@example.com");
    expect(a).toBe(recipientIdempotencyKey("campaign-1", 2, "email", "guest@example.com"));
    expect(a).not.toBe(recipientIdempotencyKey("campaign-1", 3, "email", "guest@example.com"));
  });

  it("calculates quiet hours across midnight in Asia/Manila", () => {
    expect(isQuietHour(new Date("2026-08-07T15:00:00Z"), 21, 8)).toBe(true);
    expect(isQuietHour(new Date("2026-08-07T06:00:00Z"), 21, 8)).toBe(false);
  });
});

describe("safe content", () => {
  it("uses a neutral preferred-name fallback and HTML escapes values", () => {
    expect(renderSafePersonalization("Hello {{preferred_name}} from {{outlet_name}}", { outletName: "Waterfront <Iloilo>", preferenceUrl: "https://example.com" })).toBe("Hello Guest from Waterfront &lt;Iloilo&gt;");
  });

  it("removes scripts, tracking images, event handlers, and javascript links", () => {
    const output = sanitizeMarketingHtml('<script>alert(1)</script><img src="track"><a href="javascript:bad()" onclick="bad()">Visit</a>');
    expect(output).not.toMatch(/script|img|onclick|javascript:/i);
    expect(output).toContain("Visit");
  });
});
