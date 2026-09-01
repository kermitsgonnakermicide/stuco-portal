// lib/validation.ts
// Every field an admin or the public can submit is validated here with
// zod before it ever reaches Prisma. Prisma's parameterized queries
// already close off SQL injection, but validation still matters: it
// rejects oversized payloads, wrong types, and out-of-range values that
// would otherwise become bad data or a stored-XSS vector once rendered.

import { z } from "zod";

// Login has no session yet, so a synchronizer CSRF token can't apply; the
// field used to be required here but was never verified server-side —
// requiring an unverified token only broke the real login form (which
// correctly doesn't send one). Per-IP rate limiting + account lockout are
// the actual defenses against login abuse (see lib/rateLimit.ts, lib/auth.ts).
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
});

const isoDate = z.coerce.date();

// Base schema without refinements to enable partial() method
const eventCreateBaseSchema = z.object({
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(3).max(300),
  description: z.string().trim().min(1).max(20000),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]),
  startsAt: isoDate,
  endsAt: isoDate.optional(),
  location: z.string().trim().max(200).optional(),
  category: z.string().trim().max(60).optional(),
  registrationMode: z.enum(["NONE", "LINK", "FORM"]),
  registrationUrl: z.string().trim().url().max(500).optional(),
  capacity: z.number().int().positive().max(10000).optional(),
  csrfToken: z.string().min(1),
});

export const eventCreateSchema = eventCreateBaseSchema.refine(
  (data) => data.registrationMode !== "LINK" || !!data.registrationUrl,
  { message: "registrationUrl is required when registrationMode is LINK", path: ["registrationUrl"] }
).refine(
  (data) => !data.endsAt || data.endsAt >= data.startsAt,
  { message: "endsAt must be after startsAt", path: ["endsAt"] }
);

export const eventUpdateSchema = eventCreateBaseSchema.partial().extend({
  csrfToken: z.string().min(1),
});

export const pointsAdjustSchema = z.object({
  houseId: z.string().cuid(),
  delta: z.number().int().refine((v) => v !== 0, "delta cannot be zero").refine(
    (v) => Math.abs(v) <= 1000,
    "delta magnitude too large — check for a data-entry error"
  ),
  reason: z.string().trim().min(3).max(280),
  csrfToken: z.string().min(1),
});

export const registrationPublicSchema = z.object({
  eventId: z.string().cuid(),
  studentName: z.string().trim().min(2).max(120),
  studentEmail: z.string().trim().toLowerCase().email().max(200),
  guardianName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  formToken: z.string().min(1),
  // Honeypot field: real users never see/fill this; bots that autofill
  // everything do. Validation must ACCEPT any value here (bounded length)
  // so the route can return its fake success — if zod rejected filled
  // honeypots with a 400 instead, bots would learn the field is a trap
  // and the route's pretend-success branch would be dead code.
  website: z.string().max(200).optional(),
});

export const eventResultSchema = z.object({
  eventId: z.string().cuid(),
  place: z.number().int().positive().max(100).optional(),
  label: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(400).optional(),
  csrfToken: z.string().min(1),
});

// File upload constraints, enforced both client-side (UX) and
// server-side (the only check that actually matters).
export const UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024, // 8 MB
  allowedMime: ["image/jpeg", "image/png", "image/webp"] as const,
};
