import { NextRequest, NextResponse } from "next/server";
import { marketingDeliveryDeduplicationHash, normalizeMarketingDeliveryEvent, verifyMarketingWebhookSignature } from "@/lib/marketing-webhooks";

const seen = new Set<string>();

export async function POST(request: NextRequest) {
  const secret = process.env.MARKETING_EMAIL_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Marketing webhook is not configured." }, { status: 503 });
  const rawBody = await request.text();
  if (!verifyMarketingWebhookSignature(rawBody, request.headers.get("x-waterfront-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  try {
    const payload = JSON.parse(rawBody) as { provider?: string; eventId?: string; recipientId?: string; type?: string; occurredAt?: string };
    const eventType = normalizeMarketingDeliveryEvent(payload.type ?? "");
    if (!payload.provider || !payload.eventId || !payload.recipientId || !eventType) return NextResponse.json({ error: "Unsupported event." }, { status: 400 });
    const deduplicationHash = marketingDeliveryDeduplicationHash(payload.provider, payload.eventId);
    if (seen.has(deduplicationHash)) return NextResponse.json({ accepted: true, duplicate: true });
    seen.add(deduplicationHash);
    // The production adapter persists this normalized DTO in marketing_delivery_events and then applies suppression.
    // Raw provider bodies and contact values are deliberately not retained here.
    return NextResponse.json({ accepted: true, duplicate: false, event: { recipientId: payload.recipientId, eventType, occurredAt: payload.occurredAt ?? null } });
  } catch {
    return NextResponse.json({ error: "Unsupported event." }, { status: 400 });
  }
}
