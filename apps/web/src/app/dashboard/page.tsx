'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import WorkflowGuide from '@/components/WorkflowGuide'
import MetricsPanel from '@/components/MetricsPanel'

interface Stats {
  publicadores: number
  activeWeeks: number
  asignacionesPendientes: number
  pendingReminders: number
  messagesSentToday: number
  recordatoriosHoy: number
  mensajesEnviados: number
}

interface Assignment {
  id: string
  date: string
  title: string
  assignee: string
  status: string
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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ publicadores: 0, activeWeeks: 0, asignacionesPendientes: 0, pendingReminders: 0, messagesSentToday: 0, recordatoriosHoy: 0, mensajesEnviados: 0 })
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ whatsapp: 'disconnected', worker: 'stopped', database: 'connected' })

  const loadData = useCallback(async () => {
    try {
      const res = await api('/api/dashboard')
      if (res.ok) {
        const data = await res.json()
        if (data.stats) setStats(data.stats)
        if (data.assignments) setAssignments(data.assignments)
        if (data.activity) setActivity(data.activity)
        if (data.systemStatus) setSystemStatus(data.systemStatus)
      }
    } catch { /* fallback to defaults */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData()
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [loadData])

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
      <div className="space-y-5 animate-pulse">
        <div className="h-7 w-40 bg-silver-mist rounded-pill" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-white rounded-card" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-56 bg-white rounded-card" />
          <div className="h-56 bg-white rounded-card" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-ink tracking-tight">Panel de control</h1>

      {/* Workflow Guide */}
      <WorkflowGuide />

      {/* Real-time Metrics */}
      <MetricsPanel
        stats={{
          publicadores: stats.publicadores,
          activeWeeks: stats.activeWeeks || 0,
          asignacionesPendientes: stats.asignacionesPendientes,
          pendingReminders: stats.pendingReminders || 0,
          messagesSentToday: stats.messagesSentToday || 0,
        }}
        whatsappStatus={systemStatus.whatsapp}
      />

      {/* Upcoming assignments + System status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upcoming assignments */}
        <div className="bg-white rounded-card p-5 sm:p-7">
          <h2 className="text-base font-semibold text-ink tracking-tight mb-4">Proximas asignaciones</h2>
          {assignments.length === 0 ? (
            <p className="text-sm text-graphite py-6 text-center">Sin asignaciones pendientes</p>
          ) : (
            <ul className="space-y-3">
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b border-silver-mist pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-ink font-medium block truncate">{a.title}</span>
                    <p className="text-xs text-graphite mt-0.5 truncate">{a.assignee}</p>
                  </div>
                  <span className="text-xs text-graphite whitespace-nowrap ml-3 flex-shrink-0">
                    {new Date(a.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* System status */}
        <div className="bg-white rounded-card p-5 sm:p-7">
          <h2 className="text-base font-semibold text-ink tracking-tight mb-4">Estado del sistema</h2>
          <div className="space-y-3">
            {([
              { label: 'WhatsApp', status: systemStatus.whatsapp },
              { label: 'Worker', status: systemStatus.worker },
              { label: 'Base de datos', status: systemStatus.database },
            ] as const).map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${statusColor(item.status)}`} />
                  <span className="text-sm text-ink">{item.label}</span>
                </div>
                <span className="text-sm text-graphite">{statusText(item.status)}</span>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          {activity.length > 0 && (
            <div className="mt-5 pt-4 border-t border-silver-mist">
              <h3 className="text-sm font-semibold text-ink mb-3">Actividad reciente</h3>
              <ul className="space-y-2">
                {activity.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-graphite truncate min-w-0">{a.description}</span>
                    <span className="text-xs text-graphite/60 whitespace-nowrap flex-shrink-0">
                      {new Date(a.time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
