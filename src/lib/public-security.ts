import { createHash, randomBytes } from "node:crypto";

export function createManageToken() {
  return randomBytes(32).toString("base64url");
}

export function hashManageToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createRequestReference(sequence = Math.floor(Math.random() * 9000) + 1000) {
  return `WFR-${new Date().getFullYear()}-${sequence}`;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export class SlidingWindowRateLimit {
  private attempts = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}
  check(key: string, now = Date.now()) {
    const active = (this.attempts.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (active.length >= this.limit) return { allowed: false, retryAfterMs: this.windowMs - (now - active[0]) };
    active.push(now);
    this.attempts.set(key, active);
    return { allowed: true, retryAfterMs: 0 };
  }
}

export type TransactionalMessage = { template: string; recipient: string; subject: string; html: string; idempotencyKey: string };

export function requestReceivedEmail(name: string, reference: string, manageUrl: string): TransactionalMessage {
  const safeName = escapeHtml(name);
  const safeReference = escapeHtml(reference);
  const safeUrl = escapeHtml(manageUrl);
  return {
    template: "request_received.v1",
    recipient: "",
    subject: `Waterfront request ${reference} received`,
    html: `<p>Hello ${safeName},</p><p>We received request <strong>${safeReference}</strong>.</p><p>Your request is not confirmed until Waterfront staff approves it and sends confirmation.</p><p><a href="${safeUrl}">Check request status</a></p>`,
    idempotencyKey: `${reference}:request_received.v1`,
  };
}
