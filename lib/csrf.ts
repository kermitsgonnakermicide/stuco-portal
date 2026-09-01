// lib/csrf.ts
// Synchronizer-token CSRF defense, layered on top of SameSite=Lax cookies
// (belt and suspenders — SameSite alone doesn't cover every browser/proxy
// edge case, and this also protects the public registration form, which
// has no session to anchor SameSite behavior to).
//
// Flow:
//  1. GET routes that render a form call issueCsrfToken(session) and embed
//     the result as a hidden field / meta tag.
//  2. POST/PUT/PATCH/DELETE routes call verifyCsrfToken(session, submitted).
//  3. Token = HMAC(sessionCsrfSecret, "csrf") so it can't be forged without
//     the server-side secret, and it changes if the session is destroyed.

import crypto from "node:crypto";

export function issueCsrfToken(csrfSecret: string): string {
  return crypto.createHmac("sha256", csrfSecret).update("csrf").digest("base64url");
}

export function verifyCsrfToken(csrfSecret: string, submitted: string | null): boolean {
  if (!submitted) return false;
  const expected = issueCsrfToken(csrfSecret);
  const a = Buffer.from(expected);
  const b = Buffer.from(submitted);
  // Constant-time comparison — avoids leaking token bytes via timing.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * For the unauthenticated public registration form, which has no user
 * session: issue a short-lived, signed, stateless token instead.
 */
const PUBLIC_FORM_SECRET = process.env.CSRF_PUBLIC_SECRET ?? "";

// In production a missing/weak CSRF secret means the public registration
// token (HMAC with an empty key) is trivially forgeable. Fail fast rather
// than silently shipping an insecure public form. Skip during `next build`
// (see NEXT_PHASE note in lib/auth.ts); guard fires on first real request.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  PUBLIC_FORM_SECRET.length < 32
) {
  throw new Error(
    "CSRF_PUBLIC_SECRET must be set to a strong random value (openssl rand -base64 32) in production."
  );
}

export function issuePublicFormToken(formId: string): string {
  const ts = Date.now().toString();
  const sig = crypto
    .createHmac("sha256", PUBLIC_FORM_SECRET)
    .update(`${formId}:${ts}`)
    .digest("base64url");
  return `${ts}.${sig}`;
}

export function verifyPublicFormToken(formId: string, token: string | null, maxAgeMs = 1000 * 60 * 30): boolean {
  if (!token) return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  if (Date.now() - Number(ts) > maxAgeMs) return false;

  const expected = crypto
    .createHmac("sha256", PUBLIC_FORM_SECRET)
    .update(`${formId}:${ts}`)
    .digest("base64url");

  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
