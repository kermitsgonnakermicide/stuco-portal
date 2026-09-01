"use client";

// Points adjustment form. Delta is signed: +25 for a win, -10 for a
// deduction. The API enforces |delta| <= 1000, non-zero, and records the
// actor — this form just keeps the input honest.
import { useState } from "react";
import { useRouter } from "next/navigation";

type HouseOption = { id: string; name: string; colorHex: string };

export default function PointsForm({ csrfToken, houses }: { csrfToken: string; houses: HouseOption[] }) {
  const router = useRouter();
  const [houseId, setHouseId] = useState(houses[0]?.id ?? "");
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    setOk("");

    const n = Number(amount);
    try {
      const res = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, delta: n, reason, csrfToken }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.entry) {
        setOk(`${n > 0 ? "+" : ""}${n} recorded for ${houses.find((h) => h.id === houseId)?.name}.`);
        setReason("");
        router.refresh(); // re-render server standings + ledger
      } else {
        setError(
          res.status === 403 ? "Security check failed — reload the page."
          : typeof data.error === "string" ? data.error
          : `Could not record (${res.status}).`
        );
      }
    } catch {
      setError("Network error — please try again.");
    }
    setSending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 lg:sticky lg:top-6">
      <h2 className="font-semibold">Award / deduct points</h2>

      <div>
        <label htmlFor="house" className="label">House</label>
        <select id="house" value={houseId} onChange={(e) => setHouseId(e.target.value)} className="input">
          {houses.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </div>

      {/* Signed stepper: quick buttons set sign+size, field stays editable */}
      <div>
        <label htmlFor="amount" className="label">Points (use − to deduct)</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {[-10, -5, +5, +10, +25].map((v) => (
            <button key={v} type="button" onClick={() => setAmount(String(v))}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${Number(amount) === v ? "border-brand-navy bg-brand-navy text-white" : "border-gray-300 text-gray-700 hover:border-gray-400"}`}>
              {v > 0 ? `+${v}` : v}
            </button>
          ))}
        </div>
        <input id="amount" required type="number" min={-1000} max={1000} step={1} value={amount}
          onChange={(e) => setAmount(e.target.value)} className="input w-32" />
        <p className="mt-1 text-xs text-gray-400">Max ±1000 per entry (anti-typo guard).</p>
      </div>

      <div>
        <label htmlFor="reason" className="label">Reason</label>
        <input id="reason" required minLength={3} maxLength={280} value={reason}
          onChange={(e) => setReason(e.target.value)} className="input"
          placeholder="Inter-house quiz winners" />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {ok && (
        <p className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{ok}</p>
      )}

      <button type="submit" disabled={sending || !houseId}
        className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed">
        {sending ? "Recording…" : "Record points"}
      </button>
    </form>
  );
}
