import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Panel Administrativo</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/publicadores" className="p-4 bg-white rounded shadow hover:shadow-md">Publicadores</Link>
        <Link href="/semanas" className="p-4 bg-white rounded shadow hover:shadow-md">Semanas</Link>
        <Link href="/historial" className="p-4 bg-white rounded shadow hover:shadow-md">Historial</Link>
      </div>
    </div>
  );
}
