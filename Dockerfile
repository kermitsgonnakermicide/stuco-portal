# Dockerfile — Events Portal (Next.js 15 + Prisma)
#
# Multi-stage build:
#   deps    : installs ALL dependencies once (native modules compiled for
#             this exact alpine base, reused by both later stages)
#   builder : prisma generate + next build
#   runner  : minimal runtime, non-root user, entrypoint runs migrations
#             and seed before starting the server
#
# Build from the source directory:
#   docker build -t events-portal .

# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
# libc6-compat: some prebuilt native binaries (sharp/argon2 fallbacks) expect glibc symbols
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
# Build tools only needed IF no prebuilt binary exists for musl — kept in
# this stage only, never shipped in the runtime image.
RUN apk add --no-cache python3 make g++ \
  && npm ci --no-fund --no-audit

# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate \
  && npm run build

# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root runtime user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# node_modules comes from the BUILDER stage — it contains the generated
# Prisma client (.prisma/client) layered onto the deps install, plus the
# native binaries compiled for this exact base image. Includes dev
# dependencies because the entrypoint seeds via tsx; trim with
# `npm ci --omit=dev` if seeding moves to a one-off job.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh ./

RUN chmod +x ./docker-entrypoint.sh \
  && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/points >/dev/null 2>&1 || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
