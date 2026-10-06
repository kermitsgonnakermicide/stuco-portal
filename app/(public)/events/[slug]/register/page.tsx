// Public registration page. The signed, time-boxed form token is minted
// server-side and handed to the client component - the API rejects
// submissions without a fresh token (30 min window), which is what keeps
// scripted spam off this endpoint.
import { prisma } from "@/lib/db";
import { issuePublicFormToken } from "@/lib/csrf";
import { notFound } from "next/navigation";
import Link from "next/link";
import RegisterForm from "@/components/RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Only PUBLISHED events with internal FORM registration get a form.
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event || event.status !== "PUBLISHED" || event.registrationMode !== "FORM") notFound();

  const formToken = issuePublicFormToken(event.id);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-brand-navy text-white shadow">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Link href={`/events/${event.slug}`} className="text-sm text-blue-200 hover:text-white transition">
            &larr; Back to event
          </Link>
          <h1 className="text-2xl font-bold mt-2">Register: {event.title}</h1>
          {event.capacity != null && (
            <p className="text-blue-100 text-sm mt-1">Limited places - {event.capacity} available.</p>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <RegisterForm eventId={event.id} formToken={formToken} />
      </div>
    </main>
  );
}
