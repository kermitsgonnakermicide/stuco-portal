import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/lib/portal";
import { issueCsrfToken } from "@/lib/csrf";
import { notFound } from "next/navigation";
import Link from "next/link";
import EventForm from "@/components/EventForm";
import DeleteEventButton from "@/components/DeleteEventButton";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffPage();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      _count: { select: { registrations: true } },
      registrations: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!event) notFound();

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Edit event</h1>
          <p className="text-sm text-gray-500 mt-0.5">{event.title}</p>
        </div>
        <DeleteEventButton eventId={event.id} csrfToken={issueCsrfToken(session.csrfSecret)} />
      </div>

      <div className="mt-6">
        <EventForm csrfToken={issueCsrfToken(session.csrfSecret)}
          defaults={{
            id: event.id,
            title: event.title,
            summary: event.summary,
            description: event.description,
            status: event.status,
            startsAt: event.startsAt.toISOString(),
            endsAt: event.endsAt ? event.endsAt.toISOString() : "",
            location: event.location ?? "",
            category: event.category ?? "",
            registrationMode: event.registrationMode,
            registrationUrl: event.registrationUrl ?? "",
            capacity: event.capacity,
          }} />
      </div>

      {event.registrationMode === "FORM" && (
        <section className="mt-10">
          <h2 className="font-semibold text-gray-900 mb-3">
            Registrations <span className="text-gray-400 font-normal">({event._count.registrations}{event.capacity != null ? ` / ${event.capacity}` : ""})</span>
          </h2>
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold hidden sm:table-cell">Guardian</th>
                  <th className="px-4 py-2.5 font-semibold">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {event.registrations.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{r.studentName}</p>
                      <a href={`mailto:${r.studentEmail}`} className="text-xs text-blue-700 hover:underline">{r.studentEmail}</a>
                      {r.notes && <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 hidden sm:table-cell">{r.guardianName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
                {event.registrations.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">No registrations yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {event._count.registrations > 100 && (
            <p className="mt-2 text-xs text-gray-400">
              Showing the 100 most recent — full list in the database.
            </p>
          )}
        </section>
      )}

      <p className="mt-8 text-sm">
        <Link href="/portal" className="text-blue-700 hover:text-blue-900 transition">&larr; Back to dashboard</Link>
      </p>
    </main>
  );
}
