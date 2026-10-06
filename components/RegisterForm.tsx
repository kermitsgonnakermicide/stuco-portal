"use client";

// Public registration form. The honeypot field ("website") is hidden with
// CSS + aria-hidden and must never be autofilled by real users - bots that
// fill it get a fake success response from the API.
import { useState } from "react";

export default function RegisterForm({ eventId, formToken }: { eventId: string; formToken: string }) {
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot - leave empty
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");

    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          studentName,
          studentEmail,
          guardianName: guardianName || undefined,
          notes: notes || undefined,
          website: website || undefined,
          formToken, // minted server-side when this page rendered (30 min window)
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        setDone(true);
      } else {
        // Surface the API's friendly message verbatim (event full,
        // already registered, expired form...).
        setError(
          typeof data.error === "string"
            ? data.error
            : "Please check your details and try again."
        );
        setState("idle");
      }
    } catch {
      setError("Network error - please try again.");
      setState("idle");
    }
  }

  if (done) {
    return (
      <div className="card text-center">
        <p className="text-4xl" aria-hidden>🎉</p>
        <h2 className="text-xl font-semibold mt-2">You&apos;re registered!</h2>
        <p className="text-gray-600 mt-1 text-sm">
          A confirmation has been recorded for <strong>{studentEmail}</strong>. See you there!
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <label htmlFor="studentName" className="label">Student name</label>
        <input id="studentName" required minLength={2} maxLength={120} value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          className="input" autoComplete="name" />
      </div>

      <div>
        <label htmlFor="studentEmail" className="label">Student email</label>
        <input id="studentEmail" required type="email" maxLength={200} value={studentEmail}
          onChange={(e) => setStudentEmail(e.target.value)}
          className="input" autoComplete="email" inputMode="email" />
      </div>

      <div>
        <label htmlFor="guardianName" className="label">Parent / guardian name <span className="text-gray-400">(optional)</span></label>
        <input id="guardianName" maxLength={120} value={guardianName}
          onChange={(e) => setGuardianName(e.target.value)}
          className="input" autoComplete="name" />
      </div>

      <div>
        <label htmlFor="notes" className="label">Notes <span className="text-gray-400">(optional)</span></label>
        <textarea id="notes" rows={3} maxLength={500} value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input" placeholder="Allergies, accessibility needs, anything we should know" />
      </div>

      {/* Honeypot: removed from layout AND tab order / screen readers, but
          present in the DOM where naive autofill bots will fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off"
          value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" disabled={state === "sending"} className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed">
        {state === "sending" ? "Registering..." : "Register"}
      </button>
    </form>
  );
}
