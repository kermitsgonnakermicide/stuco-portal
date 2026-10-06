// lib/db.ts
// Standard Next.js Prisma singleton, avoids exhausting Postgres connections
// via hot-reload creating a new PrismaClient per request in dev.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Never log ["query"] in production - bind parameters can include
    // personal data (student names/emails) and would leak into log
    // aggregators otherwise.
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
