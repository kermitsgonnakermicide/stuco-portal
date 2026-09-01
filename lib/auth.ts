// lib/auth.ts
// Core authentication primitives. No route handler talks to bcrypt/argon2
// or touches the Session table directly — everything funnels through here
// so the hashing algorithm, cookie flags, and lockout policy live in one
// audited place.

import argon2 from "argon2";
import crypto from "node:crypto";
import { prisma } from "./db";
import { cookies } from "next/headers";
import { logAudit } from "./audit";

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours — a school staff shift
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 1000 * 60 * 15; // 15 minutes

// argon2id: memory-hard, side-channel resistant, the current OWASP
// recommendation over bcrypt/scrypt for new systems.
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, OWASP baseline
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash, algorithm mismatch, etc. Fail closed.
    return false;
  }
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// In production the pepper must be a real random secret, otherwise the
// IP hashes in audit logs are unpeppered (reversible via dictionary).
// Skip while `next build` statically evaluates modules (NEXT_PHASE is set
// to "phase-production-build"); the guard fires on first real request.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  (process.env.AUDIT_IP_PEPPER ?? "").length < 32
) {
  throw new Error(
    "AUDIT_IP_PEPPER must be set to a strong random value (openssl rand -base64 32) in production."
  );
}

export function hashIp(ip: string): string {
  // Peppered so audit logs can't be reversed into raw IPs by anyone who
  // only has DB access, not the pepper (kept in env, never in the repo).
  const pepper = process.env.AUDIT_IP_PEPPER ?? "";
  return sha256(`${pepper}:${ip}`);
}

/**
 * Attempt a login. Always takes roughly the same amount of time whether
 * the email exists or not, and never reveals via response content or
 * timing which of "no such user" / "wrong password" occurred.
 */
export async function attemptLogin(opts: {
  email: string;
  password: string;
  ip: string;
  userAgent: string | null;
}): Promise<{ ok: true; userId: string } | { ok: false; reason: "invalid" | "locked" }> {
  const email = opts.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Dummy hash so the verify() call below always runs, keeping response
  // time similar for "user not found" vs "wrong password" (timing-attack
  // mitigation for user enumeration).
  const DUMMY_HASH =
    "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Y0hVeUJmSk5xR1JmSjNqYw";

  if (!user || !user.isActive) {
    await verifyPassword(DUMMY_HASH, opts.password);
    await logAudit({
      action: "LOGIN_FAILED",
      metadata: { reason: "no_such_user" },
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
    return { ok: false, reason: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logAudit({
      actorId: user.id,
      action: "LOGIN_BLOCKED_LOCKED",
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
    return { ok: false, reason: "locked" };
  }

  const valid = await verifyPassword(user.passwordHash, opts.password);

  if (!valid) {
    const failedLogins = user.failedLogins + 1;
    const lockedUntil =
      failedLogins >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null;

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins, lockedUntil },
    });

    await logAudit({
      actorId: user.id,
      action: "LOGIN_FAILED",
      metadata: { failedLogins },
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    return { ok: false, reason: "invalid" };
  }

  // Success: reset failure counter, issue session.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });

  await logAudit({
    actorId: user.id,
    action: "LOGIN_SUCCESS",
    ip: opts.ip,
    userAgent: opts.userAgent,
  });

  return { ok: true, userId: user.id };
}

/**
 * Issue a server-side session, set an HttpOnly/Secure/SameSite cookie
 * holding only an opaque random token (never a JWT with embedded role —
 * role is looked up server-side on every request from the DB, so a role
 * change or account deactivation takes effect immediately, not at next
 * token expiry).
 */
export async function createSession(
  userId: string,
  ip: string,
  userAgent: string | null,
  opts?: { secureCookie?: boolean }
) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const csrfSecret = crypto.randomBytes(32).toString("base64url");

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      csrfSecret,
      userAgent: userAgent ?? undefined,
      ipHash: hashIp(ip),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  // Next.js 15: cookies() is async — must be awaited before use.
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Only mark the cookie Secure when we are actually serving over HTTPS
    // (inferred from the request's x-forwarded-proto). Marking it Secure on
    // a plain-HTTP connection makes browsers silently drop the cookie, which
    // is correct for real intranets but breaks local/demo HTTP access.
    secure: opts?.secureCookie ?? false,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return { token, csrfSecret };
}

export async function getCurrentSession() {
  const cookieStore = await cookies(); // Next.js 15: async
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }

  return session;
}

export async function destroySession() {
  const cookieStore = await cookies(); // Next.js 15: async
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Revoke every session for a user — used on password reset or admin-forced logout. */
export async function revokeAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
