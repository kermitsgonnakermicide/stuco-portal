// Staff dashboard: every event (including drafts) with registration
// counts, plus quick links. Data comes straight from Prisma in this
// server component — no client-side fetching, no public API round-trip.
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/lib/portal";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CHIP: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-700",
  PUBLISHED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-700",
};

function fmt(d: Date) {
  return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default async function PortalHomePage() {
  const session = await requireStaffPage();

  const events = await prisma.event.findMany({
    orderBy: { startsAt: "desc" },
    select: {
      id: true, title: true, slug: true, status: true, startsAt: true,
      location: true, category: true, registrationMode: true, capacity: true,
      _count: { select: { registrations: true } },
    },
    take: 200,
  });

  // Draft/cancelled events still get an edit link; only published ones
  // link to their public page.
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Signed in as {session.user.name} · {session.user.role}
          </p>
        </div>
        <Link href="/portal/points" className="text-sm font-medium text-blue-700 hover:text-blue-900 transition">
          House points &rarr;
        </Link>
      </div>

      <div className="mt-6 card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold hidden md:table-cell">Starts</th>
              <th className="px-4 py-3 font-semibold hidden sm:table-cell">Registration</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{e.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {e.category || "Uncategorised"}
                    {e.location ? <> · {e.location}</> : null}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className={`status-chip ${CHIP[e.status] ?? "bg-gray-200 text-gray-700"}`}>{e.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{fmt(e.startsAt)}</td>
                <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                  {e.registrationMode === "FORM"
                    ? `${e._count.registrations}${e.capacity != null ? ` / ${e.capacity}` : ""} registered`
                    : e.registrationMode === "LINK"
                      ? "External link"
                      : "None"}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link href={`/portal/events/${e.id}/edit`} className="font-medium text-blue-700 hover:text-blue-900 transition">Edit</Link>
                  {e.status === "PUBLISHED" && (
                    <>
                      {" · "}
                      <Link href={`/events/${e.slug}`} className="text-gray-500 hover:text-gray-800 transition">View</Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  No events yet — <Link href="/portal/events/new" className="text-blue-700 underline">create the first one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
