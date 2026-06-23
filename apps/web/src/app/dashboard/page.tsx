'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Stats {
  publicadores: number
  asignacionesPendientes: number
  recordatoriosHoy: number
  mensajesEnviados: number
}

interface Assignment {
  id: string
  date: string
  title: string
  assignee: string
  status: 'pendiente' | 'completada' | 'cancelada'
}

interface Reminder {
  id: string
  time: string
  recipient: string
  type: string
}

interface SystemStatus {
  whatsapp: 'connected' | 'waiting_qr' | 'disconnected'
  worker: 'running' | 'stopped'
  database: 'connected' | 'disconnected'
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ publicadores: 0, asignacionesPendientes: 0, recordatoriosHoy: 0, mensajesEnviados: 0 })
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ whatsapp: 'waiting_qr', worker: 'running', database: 'connected' })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api('/api/dashboard')
        if (res.ok) {
          const data = await res.json()
          setStats(data.stats ?? stats)
          setAssignments(data.assignments ?? [])
          setReminders(data.reminders ?? [])
          setSystemStatus(data.systemStatus ?? systemStatus)
        }
      } catch {
        // Use placeholder data on error
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const statCards = [
    { label: 'Publicadores activos', value: stats.publicadores, icon: '👥', color: 'bg-primary-100 text-primary-600' },
    { label: 'Asignaciones pendientes', value: stats.asignacionesPendientes, icon: '📋', color: 'bg-amber-100 text-amber-600' },
    { label: 'Recordatorios hoy', value: stats.recordatoriosHoy, icon: '🔔', color: 'bg-green-100 text-green-600' },
    { label: 'Mensajes enviados', value: stats.mensajesEnviados, icon: '✉️', color: 'bg-blue-100 text-blue-600' },
  ]

  const statusDot = (status: string) => {
    if (status === 'connected' || status === 'running') return 'bg-green-500'
    if (status === 'waiting_qr') return 'bg-amber-400'
    return 'bg-red-500'
  }

  const statusLabel = (status: string) => {
    const map: Record<string, string> = { connected: 'Conectado', waiting_qr: 'Esperando QR', disconnected: 'Desconectado', running: 'Activo', stopped: 'Detenido' }
    return map[status] ?? status
  }

  const badgeColor = (status: string) => {
    if (status === 'completada') return 'bg-green-100 text-green-700'
    if (status === 'cancelada') return 'bg-red-100 text-red-700'
    return 'bg-amber-100 text-amber-700'
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-slate-200 rounded-2xl" />)}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-64 bg-slate-200 rounded-2xl" />
          <div className="h-64 bg-slate-200 rounded-2xl" />
        </div>
        <div className="h-48 bg-slate-200 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Panel de control</h1>
        <p className="text-sm text-slate-500 capitalize">{today}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl p-5 shadow-soft">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${card.color}`}>
              {card.icon}
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-3">{card.value}</p>
            <p className="text-sm text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Próximas asignaciones */}
        <div className="bg-white rounded-2xl p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Próximas asignaciones</h2>
          {assignments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No hay asignaciones próximas</p>
          ) : (
            <div className="space-y-3">
              {assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{a.title}</p>
                    <p className="text-xs text-slate-500">{a.date} · {a.assignee}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${badgeColor(a.status)}`}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estado del sistema */}
        <div className="bg-white rounded-2xl p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Estado del sistema</h2>
          <div className="space-y-4">
            {[
              { label: 'WhatsApp', status: systemStatus.whatsapp },
              { label: 'Worker', status: systemStatus.worker },
              { label: 'Base de datos', status: systemStatus.database },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusDot(item.status)}`} />
                  <span className="text-sm font-medium text-slate-700">{item.label}</span>
                </div>
                <span className="text-sm text-slate-500">{statusLabel(item.status)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recordatorios pendientes */}
      <div className="bg-white rounded-2xl p-6 shadow-soft">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recordatorios pendientes</h2>
        {reminders.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No hay recordatorios pendientes</p>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{r.time}</span>
                  <span className="text-sm text-slate-700">{r.recipient}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-primary-100 text-primary-700">{r.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
