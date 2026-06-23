'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Stats {
  publicadores: number
  asignacionesPendientes: number
  recordatoriosHoy: number
  mensajesEnviados: number
}

interface Activity {
  id: string
  description: string
  time: string
}

interface SystemStatus {
  whatsapp: 'connected' | 'waiting_qr' | 'disconnected'
  worker: 'running' | 'stopped'
  database: 'connected' | 'disconnected'
}

const PeopleIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </svg>
)

const CalendarIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
)

const BellIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
)

const EnvelopeIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
)

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ publicadores: 0, asignacionesPendientes: 0, recordatoriosHoy: 0, mensajesEnviados: 0 })
  const [activity, setActivity] = useState<Activity[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ whatsapp: 'disconnected', worker: 'stopped', database: 'connected' })

  useEffect(() => {
    async function load() {
      try {
        const res = await api('/api/dashboard')
        if (res.ok) {
          const data = await res.json()
          if (data.stats) setStats(data.stats)
          if (data.activity) setActivity(data.activity)
          if (data.systemStatus) setSystemStatus(data.systemStatus)
        }
      } catch { /* fallback to defaults */ } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statCards = [
    { label: 'Publicadores', value: stats.publicadores, icon: <PeopleIcon /> },
    { label: 'Asignaciones pendientes', value: stats.asignacionesPendientes, icon: <CalendarIcon /> },
    { label: 'Recordatorios hoy', value: stats.recordatoriosHoy, icon: <BellIcon /> },
    { label: 'Mensajes enviados', value: stats.mensajesEnviados, icon: <EnvelopeIcon /> },
  ]

  const statusColor = (s: string) => {
    if (s === 'connected' || s === 'running') return 'bg-emerald-500'
    if (s === 'waiting_qr') return 'bg-amber-400'
    return 'bg-red-400'
  }

  const statusText = (s: string) => {
    const m: Record<string, string> = { connected: 'Conectado', waiting_qr: 'Esperando QR', disconnected: 'Desconectado', running: 'Activo', stopped: 'Detenido' }
    return m[s] ?? s
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-silver-mist rounded-pill" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-white rounded-card" />)}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-64 bg-white rounded-card" />
          <div className="h-64 bg-white rounded-card" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink tracking-tight">Panel de control</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-card p-7">
            <div className="text-graphite mb-3">{card.icon}</div>
            <p className="text-3xl font-bold text-ink tracking-tight">{card.value}</p>
            <p className="text-sm text-graphite mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent activity */}
        <div className="bg-white rounded-card p-7">
          <h2 className="text-lg font-semibold text-ink tracking-tight mb-4">Actividad reciente</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-graphite py-8 text-center">Sin actividad reciente</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b border-silver-mist pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-ink">{a.description}</span>
                  <span className="text-xs text-graphite whitespace-nowrap ml-4">{a.time}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* System status */}
        <div className="bg-white rounded-card p-7">
          <h2 className="text-lg font-semibold text-ink tracking-tight mb-4">Estado del sistema</h2>
          <div className="space-y-4">
            {([
              { label: 'WhatsApp', status: systemStatus.whatsapp },
              { label: 'Worker', status: systemStatus.worker },
              { label: 'Base de datos', status: systemStatus.database },
            ] as const).map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusColor(item.status)}`} />
                  <span className="text-sm text-ink">{item.label}</span>
                </div>
                <span className="text-sm text-graphite">{statusText(item.status)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
