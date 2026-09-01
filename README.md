# Shiv Nadar School Gurgaon — Events Portal

Reference implementation of the security-critical paths of a school
events portal: session auth (argon2id + server-side sessions), CSRF,
RBAC (STAFF/ADMIN), zod validation, allowlist sanitization, rate
limiting (Redis), append-only house-points ledger, audit logging, and
hardened file upload. See `ARCHITECTURE.md` for the design and threat
model.

Stack: **Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · Redis**

## Run locally (Docker)

```bash
docker-compose up --build
```

| Service | Where |
|---|---|
| Portal | http://localhost:3000 |
| Postgres 16 | `db:5432` (container network only; not published) |
| Redis 7 | `redis:6379` (container network only; not published) |

On first boot the web container waits for Postgres, applies migrations
(`prisma/migrations/`), seeds the four houses, and creates the first-run
admin account. **The one-time admin password is printed to the web
container logs**:

```bash
docker-compose logs web | grep -A2 "Seed admin"
```

Log in at `/portal/login`, then rotate that password.

To override demo secrets, copy `.env.docker.example` to `.env`
(next to `docker-compose.yml`) and fill in real values — compose reads it
automatically. Demo defaults are for laptops only.

## Run without Docker

```bash
npm ci
cp .env.example .env.local          # point DATABASE_URL at a real Postgres
npx prisma migrate deploy
npm run prisma:seed
npm run build && npm start          # or: npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm test` | Vitest unit tests (auth hashing, CSRF, validation) |
| `npm run lint` | ESLint (config pending) |
| `npm run prisma:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run prisma:seed` | Seed houses + first-run admin |

## API surface

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/auth/login` | POST | public | IP rate limit 8/15 min, per-account lockout after 5 failures |
| `/api/auth/logout` | POST | session | Revokes server-side session |
| `/api/events` | GET | public | Published events only; filters `when=upcoming\|past`, `category` |
| `/api/events` | POST | STAFF+ | CSRF body token required |
| `/api/events/[id]` | PATCH | STAFF+ | CSRF body token required |
| `/api/events/[id]` | DELETE | ADMIN | CSRF via `x-csrf-token` header |
| `/api/points` | GET | public | Leaderboard = SUM(ledger delta), short cache |
| `/api/points` | POST | STAFF+ | Append-only ledger entry + transactional audit row |
| `/api/registrations` | POST | public | Signed event-bound form token, honeypot, 20/h/IP, unique per email |
| `/api/upload` | POST | STAFF+ | Magic-byte sniffing, sharp re-encode, private S3 key (needs real S3 creds) |

Authenticated mutations expect the CSRF token returned by login in the
JSON body (`csrfToken` field); DELETE takes it via the `x-csrf-token`
header.

## Deploy to Render

A [Render Blueprint](render.yaml) provisions the managed `Postgres` and
`Redis` add-ons and creates the web service (Node 24), wiring connection
strings into `DATABASE_URL` / `REDIS_URL` automatically. Migrations and
first-run seeding run in the deploy's `preDeployCommand`.

**Steps**

1. Push this repo to GitHub/GitLab.
2. In Render: **New → Blueprint** → connect the repo. Render creates the
   two databases and the web service.
3. In the web service's **Environment** tab, set the secrets (marked
   `sync: false` in `render.yaml`). Generate with
   `openssl rand -base64 32`:
   - `AUDIT_IP_PEPPER`  (required — audit IP hashing)
   - `CSRF_PUBLIC_SECRET` (required — public registration form)
   - `NEXT_PUBLIC_SITE_URL` → your `https://…onrender.com` URL
   - `SEED_ADMIN_EMAIL` (optional; which email owns the first admin)
   - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_MEDIA_BUCKET`
     (only if you use media uploads)
4. **Deploy.** The app refuses to boot in production without the two
   required secrets (`CSRF_PUBLIC_SECRET`, `AUDIT_IP_PEPPER`) — a
   deliberate fail-fast so a misconfigured deployment can't silently
   ship with forgeable form tokens or unpeppered audit IPs.

**First login**

After the first successful deploy, read the one-time seed admin password
from the service logs (search `Seed admin` / `Password:`), then log in at
`/portal/login` and rotate it immediately. On later deploys the seeding
step is a no-op.

`npm start` binds to `0.0.0.0` and respects Render's `PORT`; the session
cookie is marked `Secure` automatically because Render terminates TLS and
forwards `x-forwarded-proto: https`.
