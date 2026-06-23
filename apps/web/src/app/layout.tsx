import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JW Reminders',
  description: 'Sistema de recordatorios de asignaciones',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
