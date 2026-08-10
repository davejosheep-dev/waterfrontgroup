import { NextRequest, NextResponse } from "next/server";
import { extractWhatsAppStatusEvents, verifyMetaWebhookSignature } from "@/lib/whatsapp-adapter";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  const events = extractWhatsAppStatusEvents(JSON.parse(rawBody));
  // A production worker upserts these normalized, deduplicated events into the durable outbox.
  // Inbound message content is deliberately ignored; this endpoint is not an inbox.
  return NextResponse.json({ accepted: true, statusEvents: events.length });
}
