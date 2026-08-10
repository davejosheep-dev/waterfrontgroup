import "server-only";
import type { TransactionalMessage } from "./public-security";

export type EmailDelivery = { status: "sent" | "suppressed" | "failed"; providerMessageId?: string; errorCategory?: string };

export interface TransactionalEmailAdapter {
  readonly name: string;
  send(message: TransactionalMessage): Promise<EmailDelivery>;
}

const localMessages: Array<TransactionalMessage & { capturedAt: string }> = [];
const sentKeys = new Set<string>();

export class LocalCaptureEmailAdapter implements TransactionalEmailAdapter {
  readonly name = "local-capture";
  async send(message: TransactionalMessage): Promise<EmailDelivery> {
    if (sentKeys.has(message.idempotencyKey)) return { status: "sent", providerMessageId: `local:${message.idempotencyKey}` };
    sentKeys.add(message.idempotencyKey);
    localMessages.push({ ...message, capturedAt: new Date().toISOString() });
    return { status: "sent", providerMessageId: `local:${message.idempotencyKey}` };
  }
}

export class DisabledEmailAdapter implements TransactionalEmailAdapter {
  readonly name = "disabled";
  async send(): Promise<EmailDelivery> { return { status: "suppressed" }; }
}

export function emailAdapter(): TransactionalEmailAdapter {
  return process.env.TRANSACTIONAL_EMAIL_PROVIDER === "local" || process.env.NODE_ENV !== "production"
    ? new LocalCaptureEmailAdapter()
    : new DisabledEmailAdapter();
}

export function capturedDevelopmentMessages() {
  return [...localMessages];
}
