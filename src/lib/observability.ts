import { randomUUID } from "node:crypto";

const sensitiveKey = /(authorization|cookie|password|secret|token|email|phone|mobile|note|card|proof)/i;

export function requestIdFrom(request: Request) {
  return request.headers.get("x-request-id")?.slice(0, 128) || randomUUID();
}

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForLog);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : redactForLog(child)]));
}

export function structuredLog(level: "info" | "warn" | "error", event: string, context: Record<string, unknown> = {}) {
  const entry = JSON.stringify({ level, event, at: new Date().toISOString(), ...redactForLog(context) as object });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
