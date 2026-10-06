// lib/points.ts
// House points are never stored as a mutable running total. The
// leaderboard is always SUM(PointsEntry.delta) grouped by house, computed
// at read time (and cheap to cache for a few seconds - see route handler).
// This means there is no "total" column an attacker or a bug could
// desync from the audit trail: the ledger IS the total.

import { prisma } from "./db";
import { logAudit } from "./audit";

export async function getLeaderboard() {
  const houses = await prisma.house.findMany({
    include: {
      _count: { select: { pointsEntries: true } },
    },
  });

  const totals = await prisma.pointsEntry.groupBy({
    by: ["houseId"],
    _sum: { delta: true },
  });

  const totalByHouse = new Map(totals.map((t) => [t.houseId, t._sum.delta ?? 0]));

  return houses
    .map((h) => ({
      id: h.id,
      name: h.name,
      colorHex: h.colorHex,
      total: totalByHouse.get(h.id) ?? 0,
      entryCount: h._count.pointsEntries,
    }))
    .sort((a, b) => b.total - a.total)
    .map((h, i) => ({ ...h, rank: i + 1 }));
}

/**
 * Record a points adjustment. Runs inside a transaction so the ledger
 * entry and its audit log row either both commit or neither does -
 * there's never a points change with no corresponding audit trail.
 */
export async function adjustPoints(opts: {
  houseId: string;
  delta: number;
  reason: string;
  actorId: string;
  ip: string;
  userAgent: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.pointsEntry.create({
      data: {
        houseId: opts.houseId,
        delta: opts.delta,
        reason: opts.reason,
        awardedById: opts.actorId,
      },
    });

    await logAudit({
      actorId: opts.actorId,
      action: "POINTS_ADJUST",
      targetType: "PointsEntry",
      targetId: entry.id,
      metadata: { houseId: opts.houseId, delta: opts.delta },
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    return entry;
  });
}
