import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { demoPreferenceToken } from "./crm-demo-data";
import { SlidingWindowRateLimit } from "./public-security";

export type PublicMarketingPreferences = {
  guestDisplayName: string;
  scopeLabel: string;
  email: { masked: string; status: "granted" | "withdrawn" | "unknown" };
  whatsapp: { masked: string; status: "granted" | "withdrawn" | "unknown" };
  noticeVersion: string;
  updatedAt: string;
};

type PreferenceRecord = PublicMarketingPreferences & {
  guestId: string;
  tokenHash: string;
  revokedAt?: string;
  lastUsedAt?: string;
};

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("unsubscribe_email"), idempotencyKey: z.string().min(12).max(120) }),
  z.object({ action: z.literal("withdraw_all"), idempotencyKey: z.string().min(12).max(120) }),
  z.object({
    action: z.literal("save"),
    emailMarketing: z.boolean(),
    whatsappMarketing: z.boolean(),
    noticeAccepted: z.literal(true),
    idempotencyKey: z.string().min(12).max(120),
  }),
]);

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const records = new Map<string, PreferenceRecord>([
  [hashToken(demoPreferenceToken), {
    guestId: "guest-camille",
    tokenHash: hashToken(demoPreferenceToken),
    guestDisplayName: "Camille",
    scopeLabel: "Waterfront Seafood & Cocktails · Iloilo",
    email: { masked: "c••••••@example.com", status: "granted" },
    whatsapp: { masked: "+63 ••• ••• 0124", status: "unknown" },
    noticeVersion: "waterfront-marketing-preview-2026-08",
    updatedAt: "2026-08-07T06:00:00.000Z",
  }],
]);

const idempotency = new Map<string, PublicMarketingPreferences>();
const limiter = new SlidingWindowRateLimit(12, 10 * 60_000);

function publicView(record: PreferenceRecord): PublicMarketingPreferences {
  return {
    guestDisplayName: record.guestDisplayName,
    scopeLabel: record.scopeLabel,
    email: { ...record.email },
    whatsapp: { ...record.whatsapp },
    noticeVersion: record.noticeVersion,
    updatedAt: record.updatedAt,
  };
}

export function getPublicPreferences(token: string, rateKey: string) {
  if (!limiter.check(`read:${rateKey}`).allowed) throw new Error("RATE_LIMITED");
  const record = records.get(hashToken(token));
  if (!record || record.revokedAt) return null;
  record.lastUsedAt = new Date().toISOString();
  return publicView(record);
}

export function updatePublicPreferences(token: string, raw: unknown, rateKey: string) {
  if (!limiter.check(`write:${rateKey}`).allowed) throw new Error("RATE_LIMITED");
  const input = updateSchema.parse(raw);
  const record = records.get(hashToken(token));
  if (!record || record.revokedAt) return null;
  const key = `${record.guestId}:${input.idempotencyKey}`;
  const previous = idempotency.get(key);
  if (previous) return previous;

  if (input.action === "unsubscribe_email") record.email.status = "withdrawn";
  if (input.action === "withdraw_all") {
    record.email.status = "withdrawn";
    record.whatsapp.status = "withdrawn";
  }
  if (input.action === "save") {
    record.email.status = input.emailMarketing ? "granted" : "withdrawn";
    record.whatsapp.status = input.whatsappMarketing ? "granted" : "withdrawn";
  }
  record.updatedAt = new Date().toISOString();
  const response = publicView(record);
  idempotency.set(key, response);
  return response;
}
