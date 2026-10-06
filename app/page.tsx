// app/page.tsx
// Public homepage: upcoming events + live house leaderboard.
// Server component - data is fetched directly via lib/ (NOT via fetch()
// to our own API routes; relative fetch() URLs are invalid during SSR).
import { prisma } from "@/lib/db";
import { getLeaderboard } from "@/lib/points";

// Leaderboard/events change as staff work, so render per request rather
// than baking the data in at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let events: Awaited<ReturnType<typeof loadEvents>> = [];
  let leaderboard: Awaited<ReturnType<typeof getLeaderboard>> = [];

  async function loadEvents() {
    return prisma.event.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { startsAt: "asc" },
      take: 10,
      select: {
        id: true, title: true, slug: true, summary: true,
        startsAt: true, endsAt: true, location: true, category: true,
        registrationMode: true, registrationUrl: true, capacity: true,
      },
    });
  }

  try {
    events = await loadEvents();
    leaderboard = await getLeaderboard();
  } catch (err) {
    // Database not reachable (e.g. first boot before migrations). Render
    // the shell instead of a 500 - the API routes fail closed meanwhile.
    console.error("Homepage data unavailable:", err);
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-[#1B2A4A] text-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold">Shiv Nadar School Gurgaon</h1>
          <p className="text-blue-100 mt-1">Events Portal - student events, registrations, and house points.</p>
          <nav className="mt-3">
            <a href="/portal/login" className="text-sm underline text-blue-200 hover:text-white">
              Staff login
            </a>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2">
          <h2 className="text-2xl font-bold mb-4">Upcoming Events</h2>
          {events.length === 0 ? (
            <p className="text-gray-500">No upcoming events at this time.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map((e) => (
                <article key={e.id} className="bg-white rounded-lg shadow p-5 border border-gray-100">
                  {e.category && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                      {e.category}
                    </span>
                  )}
                  <h3 className="text-xl font-semibold mt-2">
                    <a href={`/events/${e.slug}`} className="hover:text-blue-800 transition-colors">
                      {e.title}
                    </a>
                  </h3>
                  <p className="text-gray-600 mt-1">{e.summary}</p>
                  <p className="text-sm text-gray-500 mt-3">
                    {new Date(e.startsAt).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {e.location && <> · {e.location}</>}
                  </p>
                  {e.registrationMode === "FORM" && (
                    <a
                      href={`/events/${e.slug}/register`}
                      className="inline-block mt-3 bg-green-700 text-white text-sm px-4 py-2 rounded hover:bg-green-800"
                    >
                      Register
                    </a>
                  )}
                  {e.registrationMode === "LINK" && e.registrationUrl && (
                    <a
                      href={e.registrationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-3 bg-green-700 text-white text-sm px-4 py-2 rounded hover:bg-green-800"
                    >
                      Register (external link)
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">House Leaderboard</h2>
          {leaderboard.length === 0 ? (
            <p className="text-gray-500">No houses configured yet.</p>
          ) : (
            <ol className="bg-white rounded-lg shadow divide-y border border-gray-100">
              {leaderboard.map((h) => (
                <li key={h.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      aria-hidden
                      className="inline-block w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: h.colorHex }}
                    />
                    <span className="font-medium truncate">{h.name}</span>
                    <span className="text-gray-400 text-xs shrink-0">#{h.rank}</span>
                  </div>
                  <span className="font-bold text-lg tabular-nums ml-3">{h.total}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}