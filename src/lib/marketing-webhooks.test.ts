import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { marketingDeliveryDeduplicationHash, normalizeMarketingDeliveryEvent, shouldAdvanceMarketingDelivery, verifyMarketingWebhookSignature } from "./marketing-webhooks";

describe("marketing provider webhooks", () => {
  it("verifies the raw body signature and rejects tampering", () => {
    const body = JSON.stringify({ event: "delivered", id: "evt-1" });
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyMarketingWebhookSignature(body, signature, "secret")).toBe(true);
    expect(verifyMarketingWebhookSignature(`${body}x`, signature, "secret")).toBe(false);
  });

  it("normalizes provider events without trusting campaign state", () => {
    expect(normalizeMarketingDeliveryEvent("spamreport")).toBe("complained");
    expect(normalizeMarketingDeliveryEvent("open")).toBe("provider_reported_open");
    expect(normalizeMarketingDeliveryEvent("reservation_confirmed")).toBeNull();
  });

  it("deduplicates replayed events and resists out-of-order downgrades", () => {
    expect(marketingDeliveryDeduplicationHash("demo", "evt-1")).toBe(marketingDeliveryDeduplicationHash("demo", "evt-1"));
    expect(shouldAdvanceMarketingDelivery("delivered", "sent")).toBe(false);
    expect(shouldAdvanceMarketingDelivery("delivered", "complained")).toBe(true);
    expect(shouldAdvanceMarketingDelivery("complained", "delivered")).toBe(false);
  });
});
