// tests/csrf.test.ts
import { describe, it, expect } from "vitest";
import { issueCsrfToken, verifyCsrfToken } from "../lib/csrf";

describe("CSRF token", () => {
  it("accepts a token issued for the matching secret", () => {
    const secret = "test-session-secret";
    const token = issueCsrfToken(secret);
    expect(verifyCsrfToken(secret, token)).toBe(true);
  });

  it("rejects a token issued for a different session secret", () => {
    const token = issueCsrfToken("secret-A");
    expect(verifyCsrfToken("secret-B", token)).toBe(false);
  });

  it("rejects a missing token", () => {
    expect(verifyCsrfToken("any-secret", null)).toBe(false);
  });

  it("rejects a tampered token", () => {
    const secret = "test-session-secret";
    const token = issueCsrfToken(secret);
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyCsrfToken(secret, tampered)).toBe(false);
  });
});
