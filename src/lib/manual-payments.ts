export type ManualPaymentStatus = "draft" | "submitted_for_verification" | "verified" | "rejected" | "voided" | "partially_refunded" | "refunded";
export type PaymentChannelType = "gcash_qr" | "bdo_terminal" | "instapay" | "cash" | "other_bank_transfer" | "other";
export type ProofStatus = "pending" | "valid" | "rejected" | "redacted";
export type DeliveryState = "queued" | "accepted" | "sent" | "delivered" | "read" | "failed" | "suppressed" | "dead_letter";

export type ManualPayment = {
  id: string;
  reservationId: string;
  paymentRequirementId: string;
  amountCentavos: number;
  refundedCentavos: number;
  channelType: PaymentChannelType;
  externalReference: string;
  transactionAt: string;
  proofReceivedAt: string;
  proofHash?: string;
  proofStatus: ProofStatus;
  status: ManualPaymentStatus;
  recordedBy: string;
  submittedBy?: string;
  verifiedBy?: string;
  rejectionReason?: string;
  voidReason?: string;
  correctionOfPaymentId?: string;
  payerName?: string;
  cardBrand?: string;
  cardLastFour?: string;
  selfVerificationOverride?: boolean;
  overrideReason?: string;
};

export type PaymentTotals = {
  requiredCentavos: number;
  draftCentavos: number;
  submittedCentavos: number;
  verifiedGrossCentavos: number;
  refundedCentavos: number;
  verifiedNetCentavos: number;
  outstandingCentavos: number;
};

export function calculatePaymentTotals(requiredCentavos: number, payments: ManualPayment[]): PaymentTotals {
  const eligible = payments.filter((payment) => payment.status !== "voided" && payment.status !== "rejected");
  const draftCentavos = eligible.filter((payment) => payment.status === "draft").reduce((sum, payment) => sum + payment.amountCentavos, 0);
  const submittedCentavos = eligible.filter((payment) => payment.status === "submitted_for_verification").reduce((sum, payment) => sum + payment.amountCentavos, 0);
  const verifiedPayments = eligible.filter((payment) => ["verified", "partially_refunded", "refunded"].includes(payment.status));
  const verifiedGrossCentavos = verifiedPayments.reduce((sum, payment) => sum + payment.amountCentavos, 0);
  const refundedCentavos = verifiedPayments.reduce((sum, payment) => sum + payment.refundedCentavos, 0);
  const verifiedNetCentavos = Math.max(0, verifiedGrossCentavos - refundedCentavos);
  return {
    requiredCentavos, draftCentavos, submittedCentavos, verifiedGrossCentavos, refundedCentavos,
    verifiedNetCentavos, outstandingCentavos: Math.max(requiredCentavos - verifiedNetCentavos, 0),
  };
}

const transitions: Record<ManualPaymentStatus, ManualPaymentStatus[]> = {
  draft: ["submitted_for_verification"],
  submitted_for_verification: ["verified", "rejected"],
  verified: ["voided", "partially_refunded", "refunded"],
  rejected: [], voided: [], partially_refunded: ["partially_refunded", "refunded"], refunded: [],
};

export function canTransitionPayment(from: ManualPaymentStatus, to: ManualPaymentStatus) {
  return transitions[from].includes(to);
}

export function requiredFieldsForChannel(channel: PaymentChannelType) {
  const common = ["amountCentavos", "transactionAt", "proofReceivedAt", "externalReference", "proof"];
  if (channel === "bdo_terminal") return [...common, "terminalIdentifier"];
  if (channel === "other") return [...common, "channelDescription", "managerReason"];
  if (channel === "other_bank_transfer") return [...common, "receivingAccountReference"];
  return common;
}

export function normalizePaymentReference(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function duplicatePaymentWarnings(candidate: Pick<ManualPayment, "externalReference" | "proofHash" | "id">, existing: ManualPayment[]) {
  const reference = normalizePaymentReference(candidate.externalReference);
  return {
    duplicateReference: existing.some((payment) => payment.id !== candidate.id && normalizePaymentReference(payment.externalReference) === reference),
    duplicateProof: Boolean(candidate.proofHash && existing.some((payment) => payment.id !== candidate.id && payment.proofHash === candidate.proofHash)),
  };
}

export function canSubmitPayment(payment: ManualPayment) {
  return payment.status === "draft" && payment.amountCentavos > 0 && Boolean(payment.externalReference.trim()) && payment.proofStatus === "valid" && Boolean(payment.proofHash);
}

export function verificationDecision(input: {
  payment: ManualPayment;
  verifierId: string;
  verifierRole: "group_admin" | "group_manager" | "outlet_manager" | "accounting" | "reservations_staff" | "host" | "read_only";
  requiredCentavos: number;
  existingPayments: ManualPayment[];
  emergencyOverrideEnabled?: boolean;
  overrideReason?: string;
  allowOverpayment?: boolean;
}) {
  const authorized = ["group_admin", "group_manager", "outlet_manager", "accounting"].includes(input.verifierRole);
  if (!authorized) return { allowed: false, reason: "Verifier role is not authorized." };
  if (input.payment.status !== "submitted_for_verification") return { allowed: false, reason: "Payment is not awaiting verification." };
  if (input.payment.proofStatus !== "valid" || !input.payment.proofHash) return { allowed: false, reason: "A valid proof is required." };
  if (input.payment.recordedBy === input.verifierId) {
    const emergency = input.emergencyOverrideEnabled && input.verifierRole === "group_admin" && (input.overrideReason?.trim().length ?? 0) >= 12;
    if (!emergency) return { allowed: false, reason: "The recorder cannot verify this payment." };
  }
  const duplicates = duplicatePaymentWarnings(input.payment, input.existingPayments);
  if (duplicates.duplicateProof) return { allowed: false, reason: "This proof is already linked to another transaction." };
  const others = input.existingPayments.filter((payment) => payment.id !== input.payment.id);
  const before = calculatePaymentTotals(input.requiredCentavos, others);
  if (before.verifiedNetCentavos + input.payment.amountCentavos > input.requiredCentavos && !input.allowOverpayment) {
    return { allowed: false, reason: "Verification would create an unexplained overpayment." };
  }
  return { allowed: true, reason: input.payment.recordedBy === input.verifierId ? "Emergency override requires secondary review." : undefined };
}

export function deriveRequirementStatus(totals: PaymentTotals): "pending" | "partially_paid" | "paid" {
  if (totals.verifiedNetCentavos <= 0) return "pending";
  return totals.outstandingCentavos === 0 ? "paid" : "partially_paid";
}

export function isReadyForManualConfirmation(totals: PaymentTotals, hasConflict: boolean) {
  return totals.requiredCentavos > 0 && totals.outstandingCentavos === 0 && !hasConflict;
}

const deliveryRank: Record<DeliveryState, number> = { queued: 0, accepted: 1, sent: 2, delivered: 3, read: 4, failed: -1, suppressed: -1, dead_letter: -1 };

export function nextDeliveryState(current: DeliveryState, incoming: DeliveryState): DeliveryState {
  if (["failed", "suppressed", "dead_letter"].includes(incoming)) return incoming;
  if (["failed", "suppressed", "dead_letter"].includes(current)) return current;
  return deliveryRank[incoming] >= deliveryRank[current] ? incoming : current;
}

export function selectTransactionalChannel(input: { whatsappEnabled: boolean; whatsappConsent: "granted" | "withdrawn" | "unknown"; email?: string; emailEnabled: boolean }) {
  if (input.whatsappEnabled && input.whatsappConsent === "granted") return "whatsapp" as const;
  if (input.emailEnabled && input.email) return "email" as const;
  return "manual_copy" as const;
}

export function formatPeso(centavos: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(centavos / 100);
}
