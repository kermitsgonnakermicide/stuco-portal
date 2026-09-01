// lib/audit.ts
// Single entry point for writing to AuditLog. Deliberately narrow: it
// accepts a small, structured `metadata` object and rejects anything
// that looks like it might contain secrets, so a future call site can't
// accidentally log a password, token, or full request body.

import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { hashIp } from "./auth";

const FORBIDDEN_KEYS = ["password", "token", "secret", "hash", "cookie", "authorization"];

function assertSafeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return;
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_KEYS.some((f) => key.toLowerCase().includes(f))) {
      throw new Error(`Refusing to audit-log a field named "${key}" — looks sensitive.`);
    }
  }
}

export async function logAudit(opts: {
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string | null;
}) {
  assertSafeMetadata(opts.metadata);

  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId,
      action: opts.action,
      targetType: opts.targetType,
      targetId: opts.targetId,
      metadata: opts.metadata === undefined
        ? undefined
        : (opts.metadata as Prisma.InputJsonValue),
      ipHash: opts.ip ? hashIp(opts.ip) : undefined,
      userAgent: opts.userAgent ?? undefined,
    },
  });
}
