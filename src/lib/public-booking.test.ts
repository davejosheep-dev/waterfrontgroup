import { describe, expect, it } from "vitest";
import { canTransitionPublicRequest, duplicateFingerprint, generatePublicSlots, previewPublicPolicy, publicAvailabilityFor, sanitizeAvailabilityForPublic, validatePublicRequest } from "./public-booking";
import { createManageToken, escapeHtml, hashManageToken, requestReceivedEmail, SlidingWindowRateLimit } from "./public-security";

describe("Phase 2 public booking policy", () => {
  it("generates policy-aligned Asia/Manila slots", () => {
    const slots = generatePublicSlots("2026-08-08", previewPublicPolicy, new Date("2026-08-07T00:00:00Z"));
    expect(slots[0]).toBe("11:00");
    expect(slots).toContain("21:30");
    expect(slots.every((slot) => slot.endsWith(":00") || slot.endsWith(":30"))).toBe(true);
  });

  it("does not expose internal availability fields", () => {
    const safe = sanitizeAvailabilityForPublic({ state: "unavailable", message: "Unavailable", capacity: 60, guestName: "Private Guest", alternatives: [] });
    expect(safe).toEqual({ state: "unavailable", message: "Unavailable", alternatives: [], depositExpected: false });
    expect(safe).not.toHaveProperty("capacity");
  });

  it("enforces request status transitions", () => {
    expect(canTransitionPublicRequest("submitted", "under_review")).toBe(true);
    expect(canTransitionPublicRequest("submitted", "approved_converted")).toBe(false);
    expect(canTransitionPublicRequest("approved_converted", "withdrawn_by_guest")).toBe(false);
  });

  it("labels VIP and private event requests for staff review and deposits", () => {
    const now = new Date("2026-08-07T00:00:00Z");
    const vip = publicAvailabilityFor({ requestType: "vip_room", date: "2026-08-08", time: "18:00", guestCount: 12, durationMinutes: 240 }, previewPublicPolicy, now);
    const event = publicAvailabilityFor({ requestType: "private_event", date: "2026-08-08", time: "18:00", guestCount: 80, durationMinutes: 300 }, previewPublicPolicy, now);
    expect(vip).toMatchObject({ state: "requires_staff_review", depositExpected: true });
    expect(event).toMatchObject({ state: "requires_staff_review", depositExpected: true });
  });

  it("creates stable duplicate fingerprints from normalized contact", () => {
    const a = duplicateFingerprint({ mobile: "0917 123 4567", email: "GUEST@EXAMPLE.COM", requestType: "main_dining", date: "2026-08-09", time: "18:00" });
    const b = duplicateFingerprint({ mobile: "+63 917 123 4567", email: "guest@example.com", requestType: "main_dining", date: "2026-08-09", time: "18:00" });
    expect(a).toBe(b);
  });

  it("does not record email marketing consent without a valid email channel", () => {
    const errors = validatePublicRequest({ requestType: "main_dining", date: "2026-08-08", time: "18:00", durationMinutes: 120, guestCount: 2, fullName: "Demo Guest", mobile: "0917 123 4567", termsAccepted: true, marketingConsent: true, startedAt: Date.now() - 2_000 });
    expect(errors).toContain("Add a valid email address to choose email marketing.");
  });
});

describe("Phase 2 token, email, and rate-limit safety", () => {
  it("generates high-entropy tokens and stores deterministic hashes", () => {
    const token = createManageToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hashManageToken(token)).toHaveLength(64);
    expect(hashManageToken(token)).not.toContain(token);
  });

  it("escapes guest-provided email content and uses an idempotency key", () => {
    expect(escapeHtml("<script>alert('x')</script>")).not.toContain("<script>");
    const email = requestReceivedEmail("<b>Guest</b>", "WFR-2026-1001", "https://example.com/manage/token");
    expect(email.html).toContain("&lt;b&gt;Guest&lt;/b&gt;");
    expect(email.idempotencyKey).toBe("WFR-2026-1001:request_received.v1");
  });

  it("expires rate limit attempts after the configured window", () => {
    const limiter = new SlidingWindowRateLimit(2, 1_000);
    expect(limiter.check("contact", 0).allowed).toBe(true);
    expect(limiter.check("contact", 100).allowed).toBe(true);
    expect(limiter.check("contact", 200).allowed).toBe(false);
    expect(limiter.check("contact", 1_100).allowed).toBe(true);
  });
});
