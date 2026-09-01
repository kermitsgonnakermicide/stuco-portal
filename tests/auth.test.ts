// tests/auth.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../lib/auth";

describe("password hashing", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("CorrectHorseBattery9!");
    expect(await verifyPassword(hash, "CorrectHorseBattery9!")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("CorrectHorseBattery9!");
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("never stores the plaintext inside the hash", async () => {
    const hash = await hashPassword("CorrectHorseBattery9!");
    expect(hash).not.toContain("CorrectHorseBattery9!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("fails closed on a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-real-hash", "anything")).toBe(false);
  });
});
