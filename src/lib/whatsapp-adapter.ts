import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryState } from "./manual-payments";

export type WhatsAppTemplateSend = {
  toE164: string;
  templateName: string;
  locale: string;
  approved: boolean;
  consentGranted: boolean;
  parameters: string[];
  idempotencyKey: string;
};

export type WhatsAppSendResult = { state: DeliveryState; providerMessageId?: string; errorCategory?: string };

export interface WhatsAppAdapter {
  readonly configured: boolean;
  sendTemplate(input: WhatsAppTemplateSend): Promise<WhatsAppSendResult>;
}

export class DisabledWhatsAppAdapter implements WhatsAppAdapter {
  readonly configured = false;
  async sendTemplate(): Promise<WhatsAppSendResult> { return { state: "suppressed", errorCategory: "not_configured" }; }
}

export class MetaCloudWhatsAppAdapter implements WhatsAppAdapter {
  readonly configured = true;
  constructor(private readonly config: { graphVersion: string; phoneNumberId: string; accessToken: string }) {}
  async sendTemplate(input: WhatsAppTemplateSend): Promise<WhatsAppSendResult> {
    if (!input.approved) return { state: "suppressed", errorCategory: "template_not_approved" };
    if (!input.consentGranted) return { state: "suppressed", errorCategory: "consent_not_granted" };
    if (!/^\+[1-9]\d{7,14}$/.test(input.toE164)) return { state: "failed", errorCategory: "invalid_recipient" };
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(this.config.graphVersion)}/${encodeURIComponent(this.config.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: input.toE164.slice(1), type: "template", template: { name: input.templateName, language: { code: input.locale }, components: input.parameters.length ? [{ type: "body", parameters: input.parameters.map((text) => ({ type: "text", text: text.slice(0, 256) })) }] : [] } }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { state: response.status >= 500 || response.status === 429 ? "failed" : "dead_letter", errorCategory: `meta_http_${response.status}` };
    const payload = await response.json() as { messages?: Array<{ id?: string }> };
    return { state: "accepted", providerMessageId: payload.messages?.[0]?.id };
  }
}

export function whatsappAdapter(): WhatsAppAdapter {
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  return graphVersion && phoneNumberId && accessToken ? new MetaCloudWhatsAppAdapter({ graphVersion, phoneNumberId, accessToken }) : new DisabledWhatsAppAdapter();
}

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret = process.env.WHATSAPP_APP_SECRET) {
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const supplied = Buffer.from(signatureHeader.slice(7), "hex");
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function extractWhatsAppStatusEvents(payload: unknown) {
  const output: Array<{ providerMessageId: string; state: DeliveryState; timestamp?: string }> = [];
  if (!payload || typeof payload !== "object") return output;
  const entries = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entries)) return output;
  for (const entry of entries) {
    const changes = entry && typeof entry === "object" ? (entry as { changes?: unknown[] }).changes : undefined;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change && typeof change === "object" ? (change as { value?: { statuses?: unknown[] } }).value : undefined;
      if (!Array.isArray(value?.statuses)) continue;
      for (const status of value.statuses) {
        if (!status || typeof status !== "object") continue;
        const item = status as { id?: string; status?: string; timestamp?: string };
        if (!item.id || !["sent", "delivered", "read", "failed"].includes(item.status ?? "")) continue;
        output.push({ providerMessageId: item.id, state: item.status as DeliveryState, timestamp: item.timestamp });
      }
    }
  }
  return output;
}
