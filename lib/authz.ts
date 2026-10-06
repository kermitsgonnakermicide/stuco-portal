// lib/authz.ts
// Server-side authorization. Every mutating route calls requireRole()
// BEFORE touching the database - there is no client-trusted role, no
// hidden admin route, and no API that infers permission from what the
// UI happens to show. If this throws, the route handler must return
// the thrown response and do nothing else.

import { NextResponse } from "next/server";
import { getCurrentSession } from "./auth";
import type { Role } from "@prisma/client";

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Resolve the current user and assert they hold one of `roles`.
 * Throws AuthError(401) if not logged in, AuthError(403) if logged in
 * but under-privileged. Route handlers should catch AuthError and
 * return NextResponse.json({ error }, { status }) - never a stack trace.
 */
export async function requireRole(roles: Role[]) {
  const session = await getCurrentSession();
  if (!session) {
    throw new AuthError(401, "Authentication required");
  }
  if (!roles.includes(session.user.role)) {
    throw new AuthError(403, "Insufficient permissions");
  }
  return session;
}

export function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Never leak internals (stack traces, query fragments) to the client.
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
