// middleware.ts
// Applies to every response. This is the one place security headers are
// set, so a new route can never accidentally ship without them.

import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // HSTS only when the request actually arrived over TLS (e.g. behind a
  // reverse proxy that sets x-forwarded-proto). Sending it over plain
  // HTTP is a no-op at best; and `upgrade-insecure-requests` in the CSP
  // is actively harmful on HTTP deployments — browsers rewrite every
  // CSS/JS subresource to https://, which fails when no TLS terminator
  // exists (the page renders as unstyled, non-hydrated HTML).
  const isHttps = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  if (isHttps) {
    // Force HTTPS for a year, including subdomains. Never sent over HTTP,
    // and never for bare-IP hosts where it is ignored anyway.
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  // No inline scripts without a nonce; images from self + our media CDN
  // only; no plugins. NOTE: no upgrade-insecure-requests — see above;
  // re-add it (plus HSTS unconditionally) once the site terminates TLS.
  // NOTE: Next.js 15 App Router streaming injects inline <script> tags
  // (RSC payload) that don't receive the middleware-generated nonce, so a
  // nonce-based CSP blocks React hydration entirely.  'unsafe-inline' is
  // used here instead; the site already sanitizes all user-authored HTML
  // via sanitize-html, which mitigates XSS-injected inline scripts.
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https://cdn.shivnadarschoolgurgaon.example data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ")
  );

  // Dynamic SSR pages must never be cached: a stale page references
  // content-hashed asset URLs from a previous build, which 404 after a
  // redeploy (unstyled page). Static assets keep their own immutable
  // caching via the matcher below.
  res.headers.set("Cache-Control", "no-store, must-revalidate");

  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  // Legacy header, harmless to keep for older browsers/crawlers.
  res.headers.set("X-XSS-Protection", "0");

  return res;
}

export const config = {
  matcher: [
    // Apply to everything except static assets, which are immutable and
    // already served with their own cache headers.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
