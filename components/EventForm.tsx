"use client";

// Create/edit form for events. Registration is link-first: staff paste an
// external form URL (e.g. a Google Form) and the public card links
// straight out to it. Internal FORM mode (this portal's own registration
// table) and NONE remain selectable for when they're the right tool.
import { useState } from "react";
import { useRouter } from "next/navigation";

export type EventFormDefaults = {
  id?: string;
  title?: string;
  summary?: string;
  description?: string;
  status?: "DRAFT" | "PUBLISHED" | "CANCELLED";
  startsAt?: string; // ISO
  endsAt?: string; // ISO or ""
  location?: string;
  category?: string;
  registrationMode?: "NONE" | "LINK" | "FORM";
  registrationUrl?: string;
  capacity?: number | null;
};

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in LOCAL time.
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventForm({
  csrfToken,
  defaults = {},
}: {
  csrfToken: string;
  defaults?: EventFormDefaults;
}) {
  const router = useRouter();
  const editing = Boolean(defaults.id);

  const [title, setTitle] = useState(defaults.title ?? "");
  const [summary, setSummary] = useState(defaults.summary ?? "");
  const [description, setDescription] = useState(defaults.description ?? "");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "CANCELLED">(defaults.status ?? "DRAFT");
  const [startsAt, setStartsAt] = useState(toLocalInput(defaults.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(defaults.endsAt));
  const [location, setLocation] = useState(defaults.location ?? "");
  const [category, setCategory] = useState(defaults.category ?? "");
  const [regMode, setRegMode] = useState<"NONE" | "LINK" | "FORM">(defaults.registrationMode ?? "LINK");
  const [registrationUrl, setRegistrationUrl] = useState(defaults.registrationUrl ?? "");
  const [capacity, setCapacity] = useState(defaults.capacity != null ? String(defaults.capacity) : "");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");

    const payload: Record<string, unknown> = {
      csrfToken,
      title,
      summary,
      description,
      status,
      startsAt: startsAt ? new Date(startsAt).toISOString() : "",
    };
    if (endsAt) payload.endsAt = new Date(endsAt).toISOString();
    if (location) payload.location = location;
    if (category) payload.category = category;
    payload.registrationMode = regMode;
    if (regMode === "LINK") payload.registrationUrl = registrationUrl;
    if (regMode === "FORM" && capacity) payload.capacity = Number(capacity);

    try {
      const res = await fetch(editing ? `/api/events/${defaults.id}` : "/api/events", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.event?.id) {
        router.push("/portal");
        router.refresh();
        return;
      }
      setError(explain(data, res.status));
      setSending(false);
    } catch {
      setError("Network error - please try again.");
      setSending(false);
    }
  }

  function explain(data: { error?: unknown }, status: number): string {
    if (status === 401) return "Your session expired - reload the page and sign in again.";
    if (status === 403) return "Security check failed - reload the page and try again.";
    if (data && typeof data.error === "object" && data.error !== null) {
      // zod flatten(): collect first message per field into one line
      const flat = data.error as { fieldErrors?: Record<string, string[] | undefined> };
      const msgs = Object.entries(flat.fieldErrors ?? {})
        .map(([f, m]) => `${f}: ${m?.[0]}`)
        .slice(0, 4);
      if (msgs.length) return msgs.join(" · ");
    }
    if (typeof data.error === "string") return data.error;
    return `Could not save (${status}).`;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Details</h2>
        <div>
          <label htmlFor="title" className="label">Title</label>
          <input id="title" required minLength={3} maxLength={160} value={title}
            onChange={(e) => setTitle(e.target.value)} className="input"
            placeholder="Sports Day 2026" />
        </div>
        <div>
          <label htmlFor="summary" className="label">Summary <span className="text-gray-400">(shown on cards, max 300)</span></label>
          <input id="summary" required minLength={3} maxLength={300} value={summary}
            onChange={(e) => setSummary(e.target.value)} className="input"
            placeholder="Annual athletics championship at the main field" />
        </div>
        <div>
          <label htmlFor="description" className="label">Description</label>
          {/* Sanitized server-side on save (lib/sanitize.ts); simple HTML allowed */}
          <textarea id="description" required rows={7} maxLength={20000} value={description}
            onChange={(e) => setDescription(e.target.value)} className="input font-mono text-xs"
            placeholder="<p>Schedule, kit list, timings...</p>" />
          <p className="mt-1 text-xs text-gray-400">Basic HTML allowed (&lt;p&gt;, &lt;h2&gt;, lists, links). Scripts are stripped automatically.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="label">Starts *</label>
            <input id="startsAt" required type="datetime-local" value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="endsAt" className="label">Ends <span className="text-gray-400">(optional)</span></label>
            <input id="endsAt" type="datetime-local" value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="location" className="label">Location</label>
            <input id="location" maxLength={200} value={location}
              onChange={(e) => setLocation(e.target.value)} className="input"
              placeholder="Main hall" />
          </div>
          <div>
            <label htmlFor="category" className="label">Category</label>
            <input id="category" maxLength={60} value={category}
              onChange={(e) => setCategory(e.target.value)} className="input"
              placeholder="Athletics, Arts, Academic..." list="categories" />
            <datalist id="categories">
              <option value="Athletics" /><option value="Arts" />
              <option value="Academic" /><option value="Community" />
            </datalist>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Registration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              ["LINK", "External link", "Send people to your own form (Google Forms etc.)"],
              ["FORM", "Internal form", "Collect sign-ups right here with capacity limits"],
              ["NONE", "No registration", "Informational listing only"],
            ] as const
          ).map(([mode, label, hint]) => (
            <label key={mode}
              className={`cursor-pointer rounded-lg border p-3 transition ${regMode === mode ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-gray-200 hover:border-gray-300"}`}>
              <input type="radio" name="regMode" className="sr-only"
                checked={regMode === mode} onChange={() => setRegMode(mode)} />
              <span className="block text-sm font-semibold text-gray-900">{label}</span>
              <span className="block text-xs text-gray-500 mt-1">{hint}</span>
            </label>
          ))}
        </div>

        {regMode === "LINK" && (
          <div>
            <label htmlFor="registrationUrl" className="label">Registration link</label>
            <input id="registrationUrl" required type="url" maxLength={500} value={registrationUrl}
              onChange={(e) => setRegistrationUrl(e.target.value)} className="input"
              placeholder="https://forms.gle/..." />
            <p className="mt-1 text-xs text-gray-400">Paste your Google Form (&quot;Send&quot; &rarr; copy link) or any other sign-up URL.</p>
          </div>
        )}

        {regMode === "FORM" && (
          <div>
            <label htmlFor="capacity" className="label">Capacity <span className="text-gray-400">(optional - leave empty for unlimited)</span></label>
            <input id="capacity" type="number" min={1} max={10000} value={capacity}
              onChange={(e) => setCapacity(e.target.value)} className="input sm:w-48" placeholder="100" />
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <label htmlFor="status" className="label mb-0">Visibility</label>
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
          className="input w-auto">
          <option value="DRAFT">Draft - staff only</option>
          <option value="PUBLISHED">Published - live on the site</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <div className="grow" />

        {error && (
          <p role="alert" className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 max-w-md">{error}</p>
        )}

        <button type="submit" disabled={sending}
          className="rounded-md bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
          {sending ? "Saving..." : editing ? "Save changes" : "Create event"}
        </button>
      </section>
    </form>
  );
}
