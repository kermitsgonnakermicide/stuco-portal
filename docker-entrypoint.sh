#!/bin/sh
# docker-entrypoint.sh - runs inside the web container before the server.
# 1. Waits for Postgres by attempting the actual migration (deploy is
#    idempotent; `migrate status` is NOT usable as a readiness probe here
#    because it exits non-zero whenever migrations are still pending,
#    i.e. exactly during first boot).
# 2. Seeds houses + the first-run admin (idempotent; prints one-time password).
# 3. Execs the Next.js server as PID 1 so it receives signals.

set -e

echo "[entrypoint] applying migrations (waits for database)..."
attempt=0
until npx prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "[entrypoint] ERROR: database unreachable after 60 attempts" >&2
    exit 1
  fi
  echo "[entrypoint] database not ready, retrying ($attempt/60)..."
  sleep 2
done

echo "[entrypoint] seeding initial data (no-op if already seeded)..."
npx tsx prisma/seed.ts || echo "[entrypoint] WARNING: seed step failed - check logs" >&2

echo "[entrypoint] starting server"
exec "$@"
