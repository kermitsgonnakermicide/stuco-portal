// House points console: adjust the leaderboard and review recent ledger
// entries. Every adjustment is an append-only PointsEntry + audit row
// server-side; this UI just makes the happy path pleasant.
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/lib/portal";
import { issueCsrfToken } from "@/lib/csrf";
import { getLeaderboard } from "@/lib/points";
import PointsForm from "@/components/PointsForm";

export const dynamic = "force-dynamic";

export default async function PointsPage() {
  const session = await requireStaffPage();

  const [houses, leaderboard, recent] = await Promise.all([
    prisma.house.findMany({ orderBy: { name: "asc" } }),
    getLeaderboard(),
    prisma.pointsEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { house: true, awardedBy: { select: { name: true } } },
    }),
  ]);

  const total = leaderboard.reduce((s, h) => s + h.total, 0);
  const max = Math.max(1, ...leaderboard.map((h) => h.total));

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">House points</h1>
      <p className="text-sm text-gray-500 mt-0.5">
        Every change is permanently recorded - corrections are new entries, never edits.
      </p>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-8">
        <section className="lg:col-span-3">
          <div className="card">
            <h2 className="font-semibold mb-4">Live standings</h2>
            <ol className="space-y-3">
              {leaderboard.map((h) => (
                <li key={h.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium flex items-center gap-2">
                      <span aria-hidden className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: h.colorHex }} />
                      {h.name}
                      <span className="text-xs text-gray-400">#{h.rank}</span>
                    </span>
                    <span className="font-bold tabular-nums">{h.total}</span>
                  </div>
                  {/* Share-of-total bar, colored per house */}
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${total ? (h.total / max) * 100 : 0}%`, backgroundColor: h.colorHex }} />
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <h2 className="font-semibold mt-8 mb-3">Recent ledger</h2>
          <ul className="space-y-2">
            {recent.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm bg-white border border-gray-100 rounded-lg px-4 py-2.5">
                <span aria-hidden className={`font-bold tabular-nums w-14 shrink-0 ${e.delta > 0 ? "text-green-700" : "text-red-600"}`}>
                  {e.delta > 0 ? "+" : ""}{e.delta}
                </span>
                <span aria-hidden className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: e.house.colorHex }} />
                <span className="text-gray-900 truncate">{e.reason}</span>
                <span className="ml-auto text-xs text-gray-400 whitespace-nowrap hidden sm:inline">
                  {e.awardedBy.name} · {new Date(e.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </li>
            ))}
            {recent.length === 0 && <li className="text-sm text-gray-500">No adjustments recorded yet.</li>}
          </ul>
        </section>

        <section className="lg:col-span-2">
          <PointsForm
            csrfToken={issueCsrfToken(session.csrfSecret)}
            houses={houses.map((h) => ({ id: h.id, name: h.name, colorHex: h.colorHex }))}
          />
        </section>
      </div>
    </main>
  );
}
