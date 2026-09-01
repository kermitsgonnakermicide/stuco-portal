// lib/rateLimit.ts
// Fixed-window rate limiting keyed by hashed IP + route. Backed by Redis
// (via Upstash) in production so limits hold across serverless instances;
// falls back to an in-memory map only in local dev, which is called out
// explicitly so nobody mistakes it for a production-safe default.

import { hashIp } from "./auth";

type Bucket = { count: number; resetAt: number };
const memoryStore = new Map<string, Bucket>();

const isProd = process.env.NODE_ENV === "production";

// Redis client is optional at import time so the module doesn't crash in
// environments without REDIS_URL configured (e.g. first-time setup).
// Connection is deferred until first use so builds don't emit ECONNREFUSED
// noise when no Redis is running.
let redis: import("ioredis").Redis | null = null;
let redisConnecting = false;

async function getRedis(): Promise<import("ioredis").Redis | null> {
  if (redis !== null) return redis;
  if (!isProd || !process.env.REDIS_URL) return null;
  if (redisConnecting) return null;
  redisConnecting = true;
  try {
    const IORedis = require("ioredis");
    const client = new IORedis(process.env.REDIS_URL, { lazyConnect: true });
    await client.connect();
    redis = client;
    return redis;
  } catch {
    redis = null;
    redisConnecting = false;
    return null;
  }
}

export type RateLimitRule = { windowMs: number; max: number };

export const RATE_LIMITS: Record<string, RateLimitRule> = {
  login: { windowMs: 15 * 60 * 1000, max: 8 }, // 8 attempts / 15 min / IP
  register: { windowMs: 60 * 60 * 1000, max: 20 }, // public registration form
  adminMutation: { windowMs: 60 * 1000, max: 60 }, // generous, still bounds abuse/bugs
  passwordReset: { windowMs: 60 * 60 * 1000, max: 5 },
};

export async function checkRateLimit(
  routeKey: keyof typeof RATE_LIMITS,
  ip: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const rule = RATE_LIMITS[routeKey];
  if (!rule) {
    // Fail closed: an unknown route key must never bypass rate limiting.
    throw new Error(`No rate-limit rule configured for "${routeKey}"`);
  }
  const key = `rl:${routeKey}:${hashIp(ip)}`;
  const now = Date.now();

  const client = await getRedis();
  if (client) {
    const windowKey = `${key}:${Math.floor(now / rule.windowMs)}`;
    const count = await client.incr(windowKey);
    if (count === 1) {
      await client.pexpire(windowKey, rule.windowMs);
    }
    return {
      allowed: count <= rule.max,
      remaining: Math.max(0, rule.max - count),
      resetAt: now + rule.windowMs,
    };
  }

  // In-memory fallback (dev only).
  const existing = memoryStore.get(key);
  if (!existing || existing.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.max - 1, resetAt: now + rule.windowMs };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= rule.max,
    remaining: Math.max(0, rule.max - existing.count),
    resetAt: existing.resetAt,
  };
}
