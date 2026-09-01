// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { destroySession, getCurrentSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const session = await getCurrentSession();
  await destroySession();
  if (session) {
    await logAudit({ actorId: session.userId, action: "LOGOUT" });
  }
  return NextResponse.json({ ok: true });
}
