'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/login'); return; }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 py-6 pt-[72px] sm:px-6 lg:px-8 lg:py-8 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
