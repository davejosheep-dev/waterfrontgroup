import { describe, expect, it } from "vitest";
import {
  calculatePaymentTotals, canSubmitPayment, canTransitionPayment, deriveRequirementStatus,
  duplicatePaymentWarnings, isReadyForManualConfirmation, nextDeliveryState, normalizePaymentReference,
  requiredFieldsForChannel, selectTransactionalChannel, verificationDecision, type ManualPayment,
} from "./manual-payments";

const base: ManualPayment = {
  id: "p1", reservationId: "r1", paymentRequirementId: "req1", amountCentavos: 5_000_00, refundedCentavos: 0,
  channelType: "gcash_qr", externalReference: "GC-123", transactionAt: "2026-08-07T10:00:00+08:00",
  proofReceivedAt: "2026-08-07T10:05:00+08:00", proofHash: "hash-one", proofStatus: "valid",
  status: "submitted_for_verification", recordedBy: "staff-a", submittedBy: "staff-a",
};

describe("manual payment control", () => {
  it("calculates integer-centavo partial, unverified, refund, and outstanding totals", () => {
    const totals = calculatePaymentTotals(10_000_00, [
      { ...base, id: "draft", status: "draft", amountCentavos: 1_000_00 },
      { ...base, id: "submitted", amountCentavos: 2_000_00 },
      { ...base, id: "verified", status: "partially_refunded", amountCentavos: 6_000_00, refundedCentavos: 1_000_00 },
    ]);
    expect(totals).toMatchObject({ draftCentavos: 1_000_00, submittedCentavos: 2_000_00, verifiedGrossCentavos: 6_000_00, refundedCentavos: 1_000_00, verifiedNetCentavos: 5_000_00, outstandingCentavos: 5_000_00 });
  });

  it("enforces lifecycle and proof-required submission", () => {
    expect(canTransitionPayment("draft", "submitted_for_verification")).toBe(true);
    expect(canTransitionPayment("verified", "draft")).toBe(false);
    expect(canSubmitPayment({ ...base, status: "draft" })).toBe(true);
    expect(canSubmitPayment({ ...base, status: "draft", proofHash: undefined })).toBe(false);
  });

  it("derives channel-specific fields without card secrets", () => {
    expect(requiredFieldsForChannel("bdo_terminal")).toContain("terminalIdentifier");
    expect(requiredFieldsForChannel("bdo_terminal")).not.toContain("cardNumber");
    expect(requiredFieldsForChannel("other")).toContain("managerReason");
  });

  it("normalizes and detects duplicate references and proof hashes", () => {
    expect(normalizePaymentReference(" gc-123 ")).toBe("GC123");
    expect(duplicatePaymentWarnings({ ...base, id: "p2", externalReference: "GC 123" }, [base])).toEqual({ duplicateReference: true, duplicateProof: true });
  });

  it("prevents maker-checker self verification", () => {
    const decision = verificationDecision({ payment: base, verifierId: "staff-a", verifierRole: "outlet_manager", requiredCentavos: 10_000_00, existingPayments: [base] });
    expect(decision).toEqual({ allowed: false, reason: "The recorder cannot verify this payment." });
  });

  it("allows only reasoned group-admin emergency override", () => {
    const blocked = verificationDecision({ payment: base, verifierId: "staff-a", verifierRole: "group_admin", requiredCentavos: 10_000_00, existingPayments: [base], emergencyOverrideEnabled: true, overrideReason: "short" });
    const allowed = verificationDecision({ payment: base, verifierId: "staff-a", verifierRole: "group_admin", requiredCentavos: 10_000_00, existingPayments: [base], emergencyOverrideEnabled: true, overrideReason: "Operational emergency; secondary review required." });
    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });

  it("blocks proof reuse and ordinary overpayment", () => {
    const other = { ...base, id: "p0", status: "verified" as const, amountCentavos: 8_000_00, externalReference: "OTHER", proofHash: "other-hash" };
    expect(verificationDecision({ payment: base, verifierId: "manager", verifierRole: "outlet_manager", requiredCentavos: 10_000_00, existingPayments: [other, base] }).reason).toContain("overpayment");
    expect(verificationDecision({ payment: base, verifierId: "manager", verifierRole: "outlet_manager", requiredCentavos: 10_000_00, existingPayments: [{ ...other, proofHash: "hash-one" }, base] }).reason).toContain("already linked");
  });

  it("derives payment requirement without auto-confirming", () => {
    const totals = calculatePaymentTotals(5_000_00, [{ ...base, status: "verified" }]);
    expect(deriveRequirementStatus(totals)).toBe("paid");
    expect(isReadyForManualConfirmation(totals, false)).toBe(true);
    expect(isReadyForManualConfirmation(totals, true)).toBe(false);
  });

  it("does not downgrade later message delivery states", () => {
    expect(nextDeliveryState("delivered", "sent")).toBe("delivered");
    expect(nextDeliveryState("delivered", "read")).toBe("read");
    expect(nextDeliveryState("sent", "failed")).toBe("failed");
  });

  it("honors WhatsApp consent and chooses safe fallbacks", () => {
    expect(selectTransactionalChannel({ whatsappEnabled: true, whatsappConsent: "granted", email: "guest@example.com", emailEnabled: true })).toBe("whatsapp");
    expect(selectTransactionalChannel({ whatsappEnabled: true, whatsappConsent: "withdrawn", email: "guest@example.com", emailEnabled: true })).toBe("email");
    expect(selectTransactionalChannel({ whatsappEnabled: false, whatsappConsent: "unknown", emailEnabled: false })).toBe("manual_copy");
  });
});
