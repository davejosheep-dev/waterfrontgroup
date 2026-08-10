import { describe, expect, it } from "vitest";
import { redactForLog } from "./observability";

describe("log redaction", () => {
  it("redacts nested PII and secrets while preserving operational context", () => {
    expect(redactForLog({ action: "guest.updated", guest: { email: "guest@example.com", mobile: "+63917" }, token: "secret" })).toEqual({
      action: "guest.updated",
      guest: { email: "[REDACTED]", mobile: "[REDACTED]" },
      token: "[REDACTED]",
    });
  });
});
