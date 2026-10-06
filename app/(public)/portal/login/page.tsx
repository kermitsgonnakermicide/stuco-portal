// app/(public)/portal/login/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSending(true);

    try {
      // The API rate-limits per IP (8 / 15 min) and locks accounts after
      // 5 bad passwords - its error text is written to be shown as-is.
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        window.location.href = "/portal"; // staff dashboard
        return;
      }
      setError(typeof data.error === "string" ? data.error : "Login failed");
      setSending(false);
    } catch {
      setError("Network error - please try again.");
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-brand-navy rounded-t-xl px-6 py-5">
          <p className="text-xs uppercase tracking-widest text-brand-gold font-semibold">Shiv Nadar School Gurgaon</p>
          <h1 className="text-xl font-bold text-white mt-1">Staff sign-in</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-b-xl shadow-md p-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email" name="email" type="email" required autoComplete="username"
              className="input" value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password" name="password" type="password" required
              autoComplete="current-password"
              className="input" value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={sending}
            className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-center text-sm pt-2 border-t border-gray-100">
            <Link href="/" className="text-blue-700 hover:text-blue-900 transition">&larr; Back to the portal</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
