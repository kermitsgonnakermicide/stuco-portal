import { requireStaffPage } from "@/lib/portal";
import { issueCsrfToken } from "@/lib/csrf";
import EventForm from "@/components/EventForm";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const session = await requireStaffPage();
  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Create event</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-6">
        Events start as drafts — switch visibility to &ldquo;Published&rdquo; when it&apos;s ready for the site.
      </p>
      <EventForm csrfToken={issueCsrfToken(session.csrfSecret)} />
    </main>
  );
}
