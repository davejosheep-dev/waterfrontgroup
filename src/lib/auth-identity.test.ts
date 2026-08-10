import { describe, expect, it } from "vitest";
import { isEmailLike, isUsername, normalizeUsername, usernameFromEmail } from "./auth-identity";

describe("staff login identifiers", () => {
  it("normalizes usernames without treating them as emails", () => {
    expect(normalizeUsername("  Mika.Reyes ")).toBe("mika.reyes");
    expect(isEmailLike("mika.reyes")).toBe(false);
  });

  it("accepts only lowercase-safe username shapes after normalization", () => {
    expect(isUsername("Mika_Reyes-1")).toBe(true);
    expect(isUsername("12")).toBe(false);
    expect(isUsername("1mika")).toBe(false);
    expect(isUsername("mika@example.com")).toBe(false);
  });

  it("derives a collision-resistant bootstrap username", () => {
    expect(usernameFromEmail("1owner@example.com", "A1B2C3D4")).toBe("staff_1owner_a1b2c3");
  });
});

