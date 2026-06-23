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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">{children}</main>
    </div>
  );
}
