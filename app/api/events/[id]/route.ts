// app/api/events/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/authz";
import { eventUpdateSchema } from "@/lib/validation";
import { sanitizeEventDescription } from "@/lib/sanitize";
import { verifyCsrfToken } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";

// Next.js 15: dynamic route params are a Promise — must be awaited.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const session = await requireRole(["ADMIN", "STAFF"]);

    const body = await req.json().catch(() => null);
    const parsed = eventUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if (!verifyCsrfToken(session.csrfSecret, parsed.data.csrfToken)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const existing = await prisma.event.findUnique({ where: { id: id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { csrfToken, description, ...rest } = parsed.data;

    const event = await prisma.event.update({
      where: { id: id },
      data: {
        ...rest,
        description: description ? sanitizeEventDescription(description) : undefined,
        updatedById: session.userId,
      },
    });

    await logAudit({
      actorId: session.userId,
      action: "EVENT_UPDATE",
      targetType: "Event",
      targetId: event.id,
      metadata: { fields: Object.keys(rest) },
    });

    return NextResponse.json({ event });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// Next.js 15: dynamic route params are a Promise — must be awaited.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    // Deleting an event is ADMIN-only; STAFF can create/edit but not
    // permanently remove records, matching the two-tier role model.
    const session = await requireRole(["ADMIN"]);

    const csrfToken = req.headers.get("x-csrf-token");
    if (!verifyCsrfToken(session.csrfSecret, csrfToken)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const existing = await prisma.event.findUnique({ where: { id: id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.event.delete({ where: { id: id } });

    await logAudit({
      actorId: session.userId,
      action: "EVENT_DELETE",
      targetType: "Event",
      targetId: id,
      metadata: { title: existing.title },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
