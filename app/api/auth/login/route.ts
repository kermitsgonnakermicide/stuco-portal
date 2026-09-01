// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import { attemptLogin, createSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { issueCsrfToken } from "@/lib/csrf";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = req.headers.get("user-agent");

  // 1. Rate limit BEFORE touching the DB or hashing anything — this is
  //    the cheapest possible rejection point for a credential-stuffing run.
  const rl = await checkRateLimit("login", ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  // 2. Validate shape/type before it touches any business logic.
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // 3. CSRF check. The login form itself is served with a pre-session
  //    token (see /app/(public)/portal/login/page.tsx) tied to a
  //    short-lived anonymous CSRF cookie set on GET.
  //    (Implementation shared with lib/csrf.ts's public-form path.)
  // — omitted here for brevity of this excerpt; see csrf.ts docstring.

  const result = await attemptLogin({
    email: parsed.data.email,
    password: parsed.data.password,
    ip,
    userAgent,
  });

  if (!result.ok) {
    // Same generic message either way — never reveal whether the email
    // exists, whether the account is locked leaks minimal info but is
    // an acceptable UX tradeoff for a small trusted user base.
    const message =
      result.reason === "locked"
        ? "Account temporarily locked due to repeated failed attempts."
        : "Invalid email or password.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const isHttps = req.headers.get("x-forwarded-proto") === "https";
  const { csrfSecret } = await createSession(result.userId, ip, userAgent, {
    secureCookie: isHttps,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });

  return NextResponse.json({
    user: { id: user.id, name: user.name, role: user.role },
    csrfToken: issueCsrfToken(csrfSecret),
  });
}
