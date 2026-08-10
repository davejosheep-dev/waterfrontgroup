import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type MarketingDeliveryEvent = "accepted" | "sent" | "delivered" | "soft_bounce" | "hard_bounce" | "complained" | "unsubscribed" | "provider_reported_open" | "provider_reported_click" | "failed";

const aliases: Record<string, MarketingDeliveryEvent> = {
  accepted: "accepted", processed: "accepted", sent: "sent", delivered: "delivered",
  deferred: "soft_bounce", soft_bounce: "soft_bounce", bounce: "hard_bounce", bounced: "hard_bounce", hard_bounce: "hard_bounce",
  spamreport: "complained", complaint: "complained", complained: "complained",
  unsubscribe: "unsubscribed", unsubscribed: "unsubscribed", open: "provider_reported_open", opened: "provider_reported_open",
  click: "provider_reported_click", clicked: "provider_reported_click", dropped: "failed", failed: "failed",
};

export function verifyMarketingWebhookSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const provided = signature.replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

export function normalizeMarketingDeliveryEvent(providerType: string): MarketingDeliveryEvent | null {
  return aliases[providerType.trim().toLowerCase()] ?? null;
}

export function marketingDeliveryDeduplicationHash(provider: string, providerEventId: string) {
  return createHash("sha256").update(`${provider}|${providerEventId}`).digest("hex");
}

export function shouldAdvanceMarketingDelivery(current: MarketingDeliveryEvent | null, next: MarketingDeliveryEvent) {
  if (!current) return true;
  const terminal = new Set<MarketingDeliveryEvent>(["hard_bounce", "complained", "unsubscribed"]);
  if (terminal.has(current)) return current === next;
  if (terminal.has(next)) return true;
  const rank: Record<MarketingDeliveryEvent, number> = { accepted: 1, sent: 2, delivered: 3, provider_reported_open: 4, provider_reported_click: 5, soft_bounce: 2, failed: 2, hard_bounce: 10, complained: 10, unsubscribed: 10 };
  return rank[next] >= rank[current];
}
