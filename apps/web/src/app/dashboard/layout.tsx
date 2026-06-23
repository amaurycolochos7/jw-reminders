'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/publicadores', label: 'Publicadores' },
  { href: '/semanas', label: 'Semanas' },
  { href: '/historial', label: 'Historial' },
  { href: '/plantillas', label: 'Plantillas' },
  { href: '/configuracion', label: 'Configuración' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-gray-800 text-white p-4 space-y-2">
        <h2 className="text-lg font-bold mb-4">JW Reminders</h2>
        {navItems.map(item => (
          <Link key={item.href} href={item.href} className="block px-3 py-2 rounded hover:bg-gray-700">
            {item.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
