# Events Portal — Architecture & Security Design

Stack: **Next.js 15 (App Router) + Prisma + PostgreSQL**, media on **S3** (private bucket + CloudFront signed URLs), sessions in Postgres, rate-limit counters in **Redis**. One coherent stack end to end, no mixed frameworks.

---

## 1. Architecture overview

```
                    ┌─────────────────────────────────────────┐
   Browser  ──HTTPS──►  CDN / WAF (CloudFront + AWS WAF)       │
 (public or            │  - TLS termination, HSTS               │
  admin user)          │  - Rate/geo rules, bot managed rules    │
                        └───────────────┬─────────────────────┘
                                        │
                             ┌──────────▼──────────┐
                             │  Next.js app server   │  (containers behind ALB,
                             │  - App Router pages    │   2+ instances, autoscaled)
                             │  - API routes (REST)   │
                             │  - middleware.ts:       │
                             │    security headers     │
                             └───┬───────────┬────────┘
                                 │           │
                     ┌───────────▼──┐   ┌────▼─────────┐
                     │ PostgreSQL    │   │ Redis         │
                     │ (RDS, private │   │ (rate limits, │
                     │  subnet, TLS) │   │  ElastiCache) │
                     └───────────────┘   └───────────────┘
                                 │
                     ┌───────────▼──────────┐
                     │ S3 (private bucket)   │  media originals,
                     │ served via CloudFront │  served only via
                     │ signed URLs, no       │  signed/expiring URL
                     │ public-read ACL       │
                     └───────────────────────┘
```

**Why this stack:** Next.js API routes give server-side rendering for public content-heavy pages (good for accessibility/SEO/no-JS readability) *and* a natural home for authenticated API routes in the same codebase, so there's one deployment, one auth boundary, and no separate API origin to CORS-harden. Prisma gives parameterized queries by construction (see §4). Postgres holds sessions server-side rather than pure JWTs, so a compromised device's access can be revoked instantly.

### Request flow for a mutation (e.g. "add house points")
1. Request hits WAF/CDN → basic bot/DDoS filtering, TLS terminated.
2. `middleware.ts` attaches security headers to the eventual response.
3. Route handler: rate-limit check (IP-keyed) → session lookup (`requireRole`) → zod validation → CSRF token check → sanitize any rich text → Prisma write **inside a transaction with its audit-log row** → structured audit log entry → JSON response.
4. Every step above fails closed: any failure returns 4xx/5xx before the database is touched, except the audit log itself, which is the last write and is transactional with the business write it accompanies.

---

## 2. Threat model (STRIDE-style, scoped to this app)

| # | Threat | Vector | Mitigation |
|---|--------|--------|------------|
| T1 | **Credential stuffing / brute force** on admin login | Automated POSTs to `/api/auth/login` | Per-IP rate limit (8/15min), per-account lockout after 5 failures (15 min), argon2id hashing makes offline cracking of a leaked DB expensive, generic error message prevents user enumeration, timing-safe dummy-hash path |
| T2 | **Session hijacking** | Stolen cookie via XSS or network sniffing | `HttpOnly` + `Secure` + `SameSite=Lax` cookies, HTTPS-only (HSTS), opaque random session token (SHA-256'd before storage, so a DB leak alone doesn't yield usable tokens), 8-hour expiry, server-side revocation |
| T3 | **CSRF** on state-changing admin actions or the public registration form | Malicious third-party page auto-submits a form to the portal | Synchronizer CSRF token bound to the session's per-session secret (admin routes) or a signed time-boxed token (public form), `SameSite=Lax` as defense-in-depth, `form-action 'self'` CSP |
| T4 | **Stored XSS** via event descriptions, names, or reasons | Admin/staff account compromised, or a field meant for plain text is used to inject markup | Rich text is allowlist-sanitized **on write** (`sanitize-html`, tags/attrs/schemes restricted, no `javascript:`/`data:` URIs); every other field is plain text, always rendered via JSX auto-escaping, never `dangerouslySetInnerHTML`; CSP `script-src 'self' 'nonce-...'` blocks inline/injected scripts even if sanitization is ever bypassed |
| T5 | **SQL injection** | Malicious input in any form field or query param | 100% of DB access goes through Prisma's parameterized query builder; no raw SQL string concatenation anywhere in the codebase; `prisma.$queryRawUnsafe` is banned by convention and not used |
| T6 | **Unauthenticated / under-privileged write** ("forced browsing" to an admin API) | Direct POST/PATCH/DELETE to an API route without a valid session | Every mutating route calls `requireRole()` first and throws before any DB access if the check fails; roles are read fresh from the DB per request (never trusted from a client-supplied JWT claim); STAFF vs ADMIN split (e.g. only ADMIN can delete events or manage users) |
| T7 | **Malicious file upload** (webshell, XSS-via-SVG, oversized file, zip bomb) | Admin/staff media upload abused, or a compromised staff account | Size cap (8 MB) enforced server-side, MIME allowlist checked against **sniffed magic bytes** not client-supplied `Content-Type`, images re-encoded through `sharp` (strips metadata/scripts, normalizes format), SVG is not an allowed type, private bucket with no public-read ACL, random object keys (client filename never used as a path) |
| T8 | **Public registration form abuse** (spam, scraping, mass fake sign-ups) | Bot floods the unauthenticated `/api/registrations` endpoint | Tighter IP rate limit (20/hour), honeypot field, short-lived signed form token tied to the specific event (can't be replayed against other events or reused indefinitely), unique constraint on `(eventId, studentEmail)` |
| T9 | **House-points tampering / repudiation** | A staff member disputes "I never awarded those points," or a bug silently corrupts a running total | Points are an **append-only ledger** (`PointsEntry`), never a mutable counter; leaderboard total is always `SUM(delta)`; every entry is paired transactionally with an `AuditLog` row recording who/when/why; corrections are new offsetting entries, never edits or deletes |
| T10 | **Privilege escalation via role tampering** | Attacker tries to set their own role in a profile-update request | Role is never a client-writable field on any authenticated route; only a dedicated ADMIN-only user-management endpoint (not shown in this excerpt, same `requireRole(["ADMIN"])` pattern) can change roles, and every change is audited |
| T11 | **Sensitive data in logs** | Debug logging accidentally captures a password or session token | `logAudit()` explicitly rejects metadata keys containing `password`/`token`/`secret`/`hash`/`cookie`; Prisma query logging is disabled in production; IPs are stored peppered-hashed, never raw |
| T12 | **Clickjacking** | Portal framed inside a malicious site to trick an admin into clicking | `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` |
| T13 | **Dependency supply-chain risk** | A compromised npm package | Lockfile committed, `npm audit`/Dependabot in CI, minimal dependency surface, pinned major versions (see checklist §5) |

**Explicit non-goals / accepted risk:** this design does not attempt to defend against a fully compromised admin device (keylogger-level compromise) or a malicious insider ADMIN account — those are handled by school IT policy (device management, background checks) rather than application code. The audit log is designed to make such abuse *detectable after the fact*, not to prevent it outright.

---

## 3. Roles and authorization matrix

| Action | Public (no session) | STAFF | ADMIN |
|---|:---:|:---:|:---:|
| View published events, calendar, leaderboard | ✅ | ✅ | ✅ |
| Submit public event registration | ✅ (own form only) | ✅ | ✅ |
| Log in to portal | — | ✅ | ✅ |
| Create / edit events, upload media, enter results | ❌ | ✅ | ✅ |
| Delete events | ❌ | ❌ | ✅ |
| Add / subtract house points | ❌ | ✅ | ✅ |
| View audit log | ❌ | ❌ | ✅ |
| Manage user accounts / roles | ❌ | ❌ | ✅ |

No route infers permission from UI state. The same `requireRole()` check guards the API whether or not a STAFF user's dashboard happens to hide the "Delete" button.

---

## 4. Database schema (see `prisma/schema.prisma` for the full source of truth)

Core tables: `User` (argon2id `passwordHash`, `role` enum, lockout fields), `Session` (server-side, hashed token, per-session CSRF secret), `House`, `PointsEntry` (append-only ledger), `Event`, `EventMedia`, `EventResult`, `RegistrationEntry`, `AuditLog` (append-only, actor/action/target/hashed-IP/metadata).

Design choices that double as security controls:
- **No plaintext or reversible password storage** — `passwordHash` only.
- **Ledger, not counters** — `PointsEntry.delta` rows, summed at read time, so history can't silently drift from the displayed total.
- **Foreign keys everywhere** with `onDelete: Cascade` only where losing child rows is actually correct (event media/results/registrations cascade with their event; audit logs and points entries never cascade-delete, preserving history even if a house or event record changes).
- **`@@unique([eventId, studentEmail])`** on `RegistrationEntry` prevents duplicate sign-ups at the database level, not just in application logic (defense in depth against a race condition or a bypassed check).

---

## 5. Deployment & hardening checklist

**Transport & edge**
- [ ] TLS 1.2+ only, HSTS with `preload`, HTTP→HTTPS redirect at the load balancer (never rely on the app alone).
- [ ] Deploy behind a WAF (AWS WAF / Cloudflare) with managed rule sets (SQLi, XSS, bad bots) plus a custom rate rule on `/api/auth/login` and `/api/registrations` as a second layer above the app's own rate limiter.
- [ ] CDN in front of static assets and public GET routes; cache-busting on deploy.

**App & secrets**
- [ ] All secrets (DB URL, Redis URL, AWS keys, CSRF/audit peppers) come from the platform's encrypted secret store — never committed, `.env*` gitignored, `.env.example` has no real values.
- [ ] `npm audit` / GitHub Dependabot enabled; CI fails on high/critical vulnerabilities; dependencies patched on a defined cadence (e.g. weekly).
- [ ] `NODE_ENV=production` set; Prisma query logging **disabled** in production (already default in `lib/db.ts`).
- [ ] Rotate the seed admin password immediately after first deploy (`prisma/seed.ts` prints a one-time random password; log in and change it, or provision real accounts and deactivate the seed one).

**Database**
- [ ] Postgres in a private subnet, not internet-reachable; app connects via VPC/security-group rule only.
- [ ] `sslmode=require` on `DATABASE_URL`.
- [ ] Automated encrypted backups with a tested restore procedure.
- [ ] DB user for the app has least-privilege grants (no `SUPERUSER`, no `DROP` on production in normal operation).
- [ ] Prisma migrations applied via `prisma migrate deploy` in CI/CD, never hand-edited in production.

**Storage**
- [ ] S3 bucket has **Block Public Access** enabled at the account and bucket level; access only via CloudFront Origin Access Control + signed URLs.
- [ ] Bucket versioning + lifecycle rule to control storage growth from re-uploads.
- [ ] Separate bucket (or prefix + IAM policy) per environment (staging vs production).

**Sessions & auth**
- [ ] Session TTL and lockout thresholds reviewed against school policy (defaults: 8h session, 5 failed logins / 15 min lockout).
- [ ] "Revoke all sessions" wired into an admin action for lost/stolen devices (`revokeAllSessions()` already implemented in `lib/auth.ts`).
- [ ] Consider adding TOTP-based 2FA for ADMIN accounts specifically, given they can manage users and house points.

**Monitoring & incident response**
- [ ] Ship `AuditLog` and application error logs to a central log platform with alerting on spikes in `LOGIN_FAILED`, `LOGIN_BLOCKED_LOCKED`, or repeated 403s from the same hashed IP.
- [ ] Uptime/error monitoring (e.g. Sentry for app errors, with PII scrubbing enabled so student data never lands in a third-party error tracker).
- [ ] Documented incident response contact and process for a suspected breach (who disables accounts, who rotates secrets, who notifies families if student data is involved).

**Testing**
- [ ] `npm test` (Vitest) covers auth hashing, CSRF token issuance/verification, and validation schemas (see `tests/`); extend with integration tests against a disposable test database before go-live.
- [ ] Manual pre-launch checklist: attempt an unauthenticated POST to every mutating route and confirm 401; attempt a STAFF-role delete and confirm 403; submit an XSS payload (`<img src=x onerror=alert(1)>`) into every text field and confirm it renders as inert text or is stripped.

---

## 6. What's out of scope for this deliverable

This is a reference implementation of the security-critical paths (auth, CSRF, RBAC, validation, sanitization, rate limiting, audit logging, file-upload hardening) plus the schema and a matching public UI demo. It intentionally does not include: full CI/CD pipeline config, a complete admin UI for every CRUD screen, email/notification delivery, or a production Terraform/CDK stack for the infrastructure diagram above — those are straightforward to build on this foundation but are implementation volume rather than design decisions, and are noted here so the boundary is explicit rather than silently assumed.
