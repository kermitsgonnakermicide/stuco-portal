// Public event detail page. Descriptions are sanitized with an allowlist
// at WRITE time (lib/sanitize.ts), so the stored HTML is safe to render
// here - this page never accepts raw user HTML.
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return new Date(d).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await prisma.event.findUnique({ where: { slug } });

  // Drafts and cancellations don't get a public page - same visibility
  // rule as the API (PUBLISHED only), enforced server-side.
  if (!event || event.status !== "PUBLISHED") notFound();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-brand-navy text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between gap-4">
          <Link href="/" className="text-sm text-blue-200 hover:text-white transition">&larr; All events</Link>
          <span className="text-xs uppercase tracking-widest text-brand-gold font-semibold">Shiv Nadar School Gurgaon</span>
        </div>
      </header>

      <article className="max-w-4xl mx-auto px-4 py-10">
        {event.category && <span className="badge-category">{event.category}</span>}
        <h1 className="text-4xl font-bold mt-3 text-gray-900">{event.title}</h1>

        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm bg-white border border-gray-100 rounded-lg shadow-sm p-5">
          <div>
            <dt className="text-gray-500 font-medium">Starts</dt>
            <dd className="mt-0.5 text-gray-900">{fmt(event.startsAt)}</dd>
          </div>
          {event.endsAt && (
            <div>
              <dt className="text-gray-500 font-medium">Ends</dt>
              <dd className="mt-0.5 text-gray-900">{fmt(event.endsAt)}</dd>
            </div>
          )}
          {event.location && (
            <div>
              <dt className="text-gray-500 font-medium">Location</dt>
              <dd className="mt-0.5 text-gray-900">{event.location}</dd>
            </div>
          )}
          {event.registrationMode === "FORM" && event.capacity != null && (
            <div>
              <dt className="text-gray-500 font-medium">Capacity</dt>
              <dd className="mt-0.5 text-gray-900">{event.capacity} places</dd>
            </div>
          )}
        </dl>

        {/* Stored description is sanitized on write - see lib/sanitize.ts */}
        <div
          className="rich-text mt-8"
          dangerouslySetInnerHTML={{ __html: event.description }}
        />

        <div className="mt-10 pt-6 border-t border-gray-200">
          {event.registrationMode === "LINK" && event.registrationUrl && (
            <a href={event.registrationUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
              Register via external form &rarr;
            </a>
          )}
          {event.registrationMode === "FORM" && (
            <Link href={`/events/${event.slug}/register`} className="btn-primary">
              Register for this event &rarr;
            </Link>
          )}
          {event.registrationMode === "NONE" && (
            <p className="text-gray-500 text-sm">No registration required - just turn up.</p>
          )}
        </div>
      </article>
    </main>
  );
}
