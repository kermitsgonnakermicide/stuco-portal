"use client";

// Deletion is admin-only server-side (the API enforces it regardless of
// who sees this button); staff get the API's 403 surfaced inline.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteEventButton({ eventId, csrfToken }: { eventId: string; csrfToken: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function doDelete() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (res.ok) {
        router.push("/portal");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(
        res.status === 403
          ? "Only admins can delete events."
          : typeof data.error === "string" ? data.error : `Delete failed (${res.status})`
      );
      setSending(false);
    } catch {
      setError("Network error - please try again.");
      setSending(false);
    }
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)}
        className="text-sm font-medium text-red-600 hover:text-red-800 transition">
        Delete
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {error && <span className="text-red-700">{error}</span>}
      <button onClick={doDelete} disabled={sending}
        className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition">
        {sending ? "Deleting..." : "Confirm delete"}
      </button>
      <button onClick={() => { setConfirming(false); setError(""); }} disabled={sending}
        className="text-gray-500 hover:text-gray-800 transition">
        Cancel
      </button>
    </div>
  );
}
