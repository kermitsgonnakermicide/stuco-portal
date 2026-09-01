// app/api/points/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard, adjustPoints } from "@/lib/points";
import { requireRole, authErrorResponse } from "@/lib/authz";
import { pointsAdjustSchema } from "@/lib/validation";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";

// Public: anyone can view the live leaderboard. Read-only, no auth.
export async function GET() {
  const leaderboard = await getLeaderboard();
  const res = NextResponse.json({ leaderboard, asOf: new Date().toISOString() });
  // Short cache so a burst of homepage traffic doesn't hammer the DB,
  // but "live" still means seconds, not minutes.
  res.headers.set("Cache-Control", "public, max-age=5, stale-while-revalidate=15");
  return res;
}

// Authenticated only: add/subtract points, always ledgered + audited.
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["ADMIN", "STAFF"]);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit("adminMutation", ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = pointsAdjustSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if (!verifyCsrfToken(session.csrfSecret, parsed.data.csrfToken)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const entry = await adjustPoints({
      houseId: parsed.data.houseId,
      delta: parsed.data.delta,
      reason: parsed.data.reason,
      actorId: session.userId,
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
