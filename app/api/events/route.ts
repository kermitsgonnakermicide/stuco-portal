// app/api/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/authz";
import { eventCreateSchema } from "@/lib/validation";
import { sanitizeEventDescription } from "@/lib/sanitize";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import slugify from "slugify";

// GET is public: anyone can list PUBLISHED events, filtered by query
// params. Never exposes DRAFT events to unauthenticated requests — the
// status filter is applied server-side, not left to the client.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const when = searchParams.get("when"); // "upcoming" | "past"
  const category = searchParams.get("category") ?? undefined;

  const now = new Date();
  const where: Record<string, unknown> = { status: "PUBLISHED" };

  if (when === "upcoming") where.startsAt = { gte: now };
  if (when === "past") where.startsAt = { lt: now };
  if (category) where.category = category;

  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: when === "past" ? "desc" : "asc" },
    select: {
      id: true, title: true, slug: true, summary: true, startsAt: true,
      endsAt: true, location: true, category: true, thumbnailKey: true,
      registrationMode: true, registrationUrl: true,
    },
    take: 100,
  });

  return NextResponse.json({ events });
}

// POST requires an authenticated ADMIN or STAFF session — there is no
// unauthenticated write path to this route, full stop.
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["ADMIN", "STAFF"]);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit("adminMutation", ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = eventCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (!verifyCsrfToken(session.csrfSecret, parsed.data.csrfToken)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const slugBase = slugify(parsed.data.title, { lower: true, strict: true });
    const slug = `${slugBase}-${Date.now().toString(36)}`;

    const event = await prisma.event.create({
      data: {
        title: parsed.data.title,
        slug,
        summary: parsed.data.summary,
        description: sanitizeEventDescription(parsed.data.description),
        status: parsed.data.status,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        location: parsed.data.location,
        category: parsed.data.category,
        registrationMode: parsed.data.registrationMode,
        registrationUrl: parsed.data.registrationUrl,
        capacity: parsed.data.capacity,
        createdById: session.userId,
      },
    });

    await logAudit({
      actorId: session.userId,
      action: "EVENT_CREATE",
      targetType: "Event",
      targetId: event.id,
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
