// Shared chrome for authenticated /portal pages. The auth check itself
// lives in each page via requireStaffPage() (layouts can't pass data to
// pages), but the nav is shared here so every dashboard page looks alike.
import Link from "next/link";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-navy text-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-6">
          <Link href="/portal" className="font-bold tracking-tight hover:text-blue-100 transition">
            Shiv Nadar School Gurgaon <span className="font-normal text-blue-200">· Staff Portal</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-blue-200 hover:text-white transition">Public site</Link>
            <Link href="/portal/events/new" className="rounded-md bg-brand-gold px-3 py-1.5 font-semibold text-brand-navy hover:brightness-110 transition">
              + New event
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
