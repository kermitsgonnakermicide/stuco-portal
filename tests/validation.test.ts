// tests/validation.test.ts
import { describe, it, expect } from "vitest";
import { eventCreateSchema, pointsAdjustSchema, registrationPublicSchema } from "../lib/validation";

describe("eventCreateSchema", () => {
  const base = {
    title: "Inter-House Athletics Meet",
    summary: "Annual track and field competition between all four houses.",
    description: "<p>Full details here.</p>",
    status: "PUBLISHED" as const,
    startsAt: "2026-09-15T09:00:00.000Z",
    registrationMode: "NONE" as const,
    csrfToken: "abc123",
  };

  it("accepts a valid event", () => {
    expect(eventCreateSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = eventCreateSchema.safeParse({ ...base, title: "" });
    expect(result.success).toBe(false);
  });

  it("requires registrationUrl when registrationMode is LINK", () => {
    const result = eventCreateSchema.safeParse({ ...base, registrationMode: "LINK" });
    expect(result.success).toBe(false);
  });

  it("rejects endsAt before startsAt", () => {
    const result = eventCreateSchema.safeParse({
      ...base,
      endsAt: "2026-09-14T09:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an oversized description (guards against payload abuse)", () => {
    const result = eventCreateSchema.safeParse({
      ...base,
      description: "x".repeat(30000),
    });
    expect(result.success).toBe(false);
  });
});

describe("pointsAdjustSchema", () => {
  it("rejects a zero delta", () => {
    const result = pointsAdjustSchema.safeParse({
      houseId: "clx0000000000000000000000",
      delta: 0,
      reason: "typo entry",
      csrfToken: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an implausibly large delta", () => {
    const result = pointsAdjustSchema.safeParse({
      houseId: "clx0000000000000000000000",
      delta: 100000,
      reason: "fat-fingered an extra zero",
      csrfToken: "abc",
    });
    expect(result.success).toBe(false);
  });
});

describe("registrationPublicSchema", () => {
  it("accepts a normal registration", () => {
    const result = registrationPublicSchema.safeParse({
      eventId: "clx0000000000000000000000",
      studentName: "Aanya Kapoor",
      studentEmail: "aanya@example.com",
      formToken: "1700000000000.abc",
    });
    expect(result.success).toBe(true);
  });

  it("still parses when the honeypot field is empty", () => {
    const result = registrationPublicSchema.safeParse({
      eventId: "clx0000000000000000000000",
      studentName: "Aanya Kapoor",
      studentEmail: "aanya@example.com",
      formToken: "1700000000000.abc",
      website: "",
    });
    expect(result.success).toBe(true);
  });
});
