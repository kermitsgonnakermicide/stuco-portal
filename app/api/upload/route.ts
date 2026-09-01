// app/api/upload/route.ts
// File upload hardening checklist applied here:
//  1. Auth + role required — no unauthenticated upload path.
//  2. Size capped (8 MB) before the body is fully buffered where possible.
//  3. MIME type checked against an allowlist — AND the actual file bytes
//     are sniffed (not just trusting the client-supplied Content-Type,
//     which is trivially spoofable).
//  4. Filenames are never trusted: we generate a random key and never
//     use the client-supplied filename as a path component.
//  5. Files are stored in a PRIVATE S3 bucket (no public-read ACL) and
//     served only via short-lived signed GET URLs, so a leaked/guessed
//     key alone doesn't grant standing access.
//  6. Uploaded images are re-encoded (via sharp) rather than stored
//     as-is, which strips embedded scripts/metadata and neutralizes
//     polyglot-file attacks (e.g. a GIFAR or an SVG with inline JS —
//     SVG is not on the allowlist at all, for this reason).
//  7. Bucket + CDN are configured separately with a strict CSP-aligned
//     CORS policy (see deployment checklist).

import { NextRequest, NextResponse } from "next/server";
import { requireRole, authErrorResponse } from "@/lib/authz";
import { UPLOAD_LIMITS } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["ADMIN", "STAFF"]);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit("adminMutation", ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const altText = form.get("altText");
    const eventId = form.get("eventId");

    if (!(file instanceof File) || typeof altText !== "string" || !altText.trim()) {
      return NextResponse.json(
        { error: "file and non-empty altText are required" },
        { status: 400 }
      );
    }
    if (typeof eventId !== "string") {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    if (file.size > UPLOAD_LIMITS.maxBytes) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Sniff real content type from magic bytes — never trust file.type.
    const sniffed = await fileTypeFromBuffer(buffer);
    if (!sniffed || !UPLOAD_LIMITS.allowedMime.includes(sniffed.mime as any)) {
      return NextResponse.json({ error: "Unsupported or spoofed file type" }, { status: 415 });
    }

    // Re-encode through sharp: strips EXIF/metadata, normalizes format,
    // and guarantees the bytes we store are actually a valid raster
    // image rather than a disguised payload.
    const processed = await sharp(buffer)
      .resize({ width: 2000, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const key = `events/${eventId}/${crypto.randomUUID()}.webp`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_MEDIA_BUCKET,
        Key: key,
        Body: processed,
        ContentType: "image/webp",
        // No ACL: bucket is private-by-default; access is via signed URL
        // or CloudFront OAC only.
      })
    );

    await logAudit({
      actorId: session.userId,
      action: "MEDIA_UPLOAD",
      targetType: "EventMedia",
      targetId: key,
      metadata: { eventId, sizeBytes: processed.length },
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ key }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
