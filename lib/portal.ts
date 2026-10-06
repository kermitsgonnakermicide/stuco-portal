// lib/portal.ts
// Server-side gate for /portal pages. API routes use requireRole() which
// throws; pages can't throw a response, so this variant redirects to the
// login page instead - same policy (session must be live AND role must be
// STAFF or ADMIN), different failure mode for HTML vs JSON consumers.
import { redirect } from "next/navigation";
import { getCurrentSession } from "./auth";
import type { Session } from "@prisma/client";

export async function requireStaffPage(): Promise<Session & { user: { id: string; name: string; email: string; role: "ADMIN" | "STAFF" } }> {
  const session = await getCurrentSession();
  if (!session) redirect("/portal/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "STAFF") {
    redirect("/portal/login?error=forbidden");
  }
  return session as Session & { user: { id: string; name: string; email: string; role: "ADMIN" | "STAFF" } };
}
