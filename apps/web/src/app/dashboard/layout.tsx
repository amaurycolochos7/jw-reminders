'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { lockedFeatureFor } from '@/lib/locked-features';

/** Aviso que sustituye al contenido de un apartado bloqueado. */
function LockedNotice({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-sand">
          <svg className="h-7 w-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <h1 className="mb-2 text-lg font-semibold text-ink">{label} bloqueado</h1>
        <p className="text-sm text-muted">{reason}</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/login'); return; }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  // El apartado sigue existiendo en el código; aquí solo se corta el acceso.
  const locked = lockedFeatureFor(pathname);

  return (
    <div className="flex h-dvh w-full">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto px-4 py-6 pt-[72px] sm:px-6 lg:px-8 lg:py-8 lg:pt-8">
        {locked ? <LockedNotice label={locked.label} reason={locked.reason} /> : children}
      </main>
    </div>
  );
}
