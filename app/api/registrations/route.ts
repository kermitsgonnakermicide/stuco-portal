// app/api/registrations/route.ts
// This is the ONLY write endpoint in the app that doesn't require a
// logged-in session — by design, so parents/students can register for
// an event without an account. "Unauthenticated" does not mean
// "unprotected": it still gets its own signed, time-boxed form token
// (see lib/csrf.ts), a tight rate limit, strict validation, a honeypot
// field, and every write is logged. This is the threat-model boundary
// called out explicitly in the architecture doc.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { registrationPublicSchema } from "@/lib/validation";
import { verifyPublicFormToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const rl = await checkRateLimit("register", ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many submissions, please try later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = registrationPublicSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
  }

  // Honeypot: bots fill every field, real users never see this one
  // (hidden via CSS + aria-hidden, not just visually off-screen).
  if (parsed.data.website) {
    // Pretend success so the bot doesn't learn the honeypot worked.
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (!verifyPublicFormToken(parsed.data.eventId, parsed.data.formToken)) {
    return NextResponse.json({ error: "Form expired, please reload the page." }, { status: 403 });
  }

  const event = await prisma.event.findUnique({ where: { id: parsed.data.eventId } });
  if (!event || event.status !== "PUBLISHED" || event.registrationMode !== "FORM") {
    return NextResponse.json({ error: "Registration is not open for this event." }, { status: 400 });
  }

  if (event.capacity) {
    const count = await prisma.registrationEntry.count({ where: { eventId: event.id } });
    if (count >= event.capacity) {
      return NextResponse.json({ error: "This event is full." }, { status: 409 });
    }
  }

  try {
    const entry = await prisma.registrationEntry.create({
      data: {
        eventId: event.id,
        studentName: parsed.data.studentName,
        studentEmail: parsed.data.studentEmail,
        guardianName: parsed.data.guardianName,
        notes: parsed.data.notes,
      },
    });

    await logAudit({
      action: "PUBLIC_REGISTRATION",
      targetType: "RegistrationEntry",
      targetId: entry.id,
      metadata: { eventId: event.id },
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      // Unique constraint on [eventId, studentEmail] — already registered.
      return NextResponse.json({ error: "You're already registered for this event." }, { status: 409 });
    }
    throw err;
  }
}
