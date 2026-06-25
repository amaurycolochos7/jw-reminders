'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
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

interface OperationDelivery {
  id: string
  localTime: string
  reminderType: string
  recipientRole: string
  status: string
  publisherName: string
  assignmentTitle: string
  programName: string | null
}

interface OperationBucket {
  total: number
  assigned: number
  companions: number
  pending: number
  queued: number
  sending: number
  sent: number
  failed: number
  skipped: number
  cancelled: number
  dead: number
  deliveries: OperationDelivery[]
}

interface Operations {
  timezone: string
  sendHour: number
  today: OperationBucket
  tomorrow: OperationBucket
  failed: Array<{
    id: string
    status: string
    reminderType: string
    publisherName: string
    assignmentTitle: string
    programName: string | null
    errorMessage: string | null
  }>
  weekStatus: Array<{
    id: string
    meetingDate: string
    meetingTime: string
    programName: string | null
    assignmentCount: number
    deliveryCount: number
    pending: number
    failed: number
    sent: number
    fullyNotified: boolean
  }>
  currentProgram: { id: string; name: string; status: string; weekCount: number } | null
}

const typeLabels: Record<string, string> = {
  INITIAL_NOTICE: 'Aviso inicial',
  SEVEN_DAYS_BEFORE: '7 dias antes',
  THREE_DAYS_BEFORE: '3 dias antes',
  ONE_DAY_BEFORE: '1 dia antes',
  SAME_DAY: 'Mismo dia',
  CHANGE_NOTICE: 'Cambio',
  CANCELLATION_NOTICE: 'Cancelacion',
}

const statusClasses: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  QUEUED: 'bg-amber-50 text-amber-700',
  SENDING: 'bg-fog text-azure',
  SENT: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  SKIPPED: 'bg-fog text-graphite',
  CANCELLED: 'bg-red-50 text-red-600',
  DEAD: 'bg-red-50 text-red-700',
}

function formatDate(iso: string): string {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${months[m - 1]} ${y}`
}

function bucketLine(bucket: OperationBucket) {
  if (bucket.total === 0) return 'Sin mensajes programados'
  return `${bucket.total} mensajes / ${bucket.assigned} asignados / ${bucket.companions} acompanantes`
}

function DeliveryList({ deliveries }: { deliveries: OperationDelivery[] }) {
  if (deliveries.length === 0) {
    return <p className="text-sm text-graphite py-6 text-center">Sin entregas en este rango</p>
  }

  return (
    <ul className="divide-y divide-silver-mist">
      {deliveries.map((delivery) => (
        <li key={delivery.id} className="py-3 grid grid-cols-[56px_1fr_auto] gap-3 items-center">
          <span className="text-sm font-semibold text-ink">{delivery.localTime}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">{delivery.publisherName}</p>
            <p className="text-xs text-graphite truncate">
              {delivery.assignmentTitle} / {typeLabels[delivery.reminderType] || delivery.reminderType}
            </p>
          </div>
          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-pill ${statusClasses[delivery.status] || 'bg-fog text-graphite'}`}>
            {delivery.recipientRole === 'COMPANION' ? 'Acomp.' : 'Asignado'}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ publicadores: 0, activeWeeks: 0, asignacionesPendientes: 0, pendingReminders: 0, messagesSentToday: 0, recordatoriosHoy: 0, mensajesEnviados: 0 })
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [operations, setOperations] = useState<Operations | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ whatsapp: 'disconnected', worker: 'stopped', database: 'connected' })

  const loadData = useCallback(async () => {
    try {
      const res = await api('/api/dashboard')
      if (res.ok) {
        const data = await res.json()
        if (data.stats) setStats(data.stats)
        if (data.assignments) setAssignments(data.assignments)
        if (data.activity) setActivity(data.activity)
        if (data.operations) setOperations(data.operations)
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

      {operations && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
            <section className="bg-white rounded-card p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-ink tracking-tight">Hoy se enviaran</h2>
                  <p className="text-sm text-graphite mt-1">{bucketLine(operations.today)}</p>
                </div>
                <Link href="/dashboard/automatizaciones?range=today" className="text-xs font-medium text-azure px-3 py-1.5 rounded-pill hover:bg-azure/5">
                  Ver todo
                </Link>
              </div>
              <DeliveryList deliveries={operations.today.deliveries} />
            </section>

            <section className="bg-white rounded-card p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-ink tracking-tight">Manana</h2>
                  <p className="text-sm text-graphite mt-1">{bucketLine(operations.tomorrow)}</p>
                </div>
                <Link href="/dashboard/automatizaciones?range=tomorrow" className="text-xs font-medium text-azure px-3 py-1.5 rounded-pill hover:bg-azure/5">
                  Ver agenda
                </Link>
              </div>
              <DeliveryList deliveries={operations.tomorrow.deliveries} />
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="bg-white rounded-card p-5 sm:p-7">
              <h2 className="text-base font-semibold text-ink tracking-tight">Programa en curso</h2>
              {operations.currentProgram ? (
                <div className="mt-4">
                  <p className="text-2xl font-semibold text-ink">{operations.currentProgram.name}</p>
                  <p className="text-sm text-graphite mt-1">{operations.currentProgram.weekCount} semanas / {operations.currentProgram.status}</p>
                </div>
              ) : (
                <p className="text-sm text-graphite mt-4">No hay programa mensual activo para este mes.</p>
              )}
              <p className="text-xs text-graphite mt-5">Zona: {operations.timezone} / envio: {String(operations.sendHour).padStart(2, '0')}:00</p>
            </section>

            <section className="bg-white rounded-card p-5 sm:p-7 lg:col-span-2">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-ink tracking-tight">Semanas proximas</h2>
                  <p className="text-sm text-graphite mt-1">Estado de notificacion de los proximos 7 dias.</p>
                </div>
                <Link href="/dashboard/semanas" className="text-xs font-medium text-azure px-3 py-1.5 rounded-pill hover:bg-azure/5">
                  Ver semanas
                </Link>
              </div>
              {operations.weekStatus.length === 0 ? (
                <p className="text-sm text-graphite py-6 text-center">Sin semanas activas proximas</p>
              ) : (
                <div className="divide-y divide-silver-mist">
                  {operations.weekStatus.map((week) => (
                    <Link key={week.id} href={`/dashboard/semanas/${week.id}`} className="py-3 grid grid-cols-1 md:grid-cols-[1fr_130px_150px] gap-2 md:items-center hover:bg-fog/50 px-2 -mx-2 rounded-xl">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{week.programName || 'Sin programa'} / {formatDate(week.meetingDate)}</p>
                        <p className="text-xs text-graphite">{week.assignmentCount} asignaciones / {week.deliveryCount} entregas</p>
                      </div>
                      <p className="text-xs text-graphite">{week.pending} pendientes</p>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-pill justify-self-start ${week.fullyNotified ? 'bg-emerald-50 text-emerald-700' : week.failed > 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                        {week.fullyNotified ? 'Notificada' : week.failed > 0 ? 'Con fallos' : 'En proceso'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          {operations.failed.length > 0 && (
            <section className="bg-white rounded-card p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-ink tracking-tight">Mensajes con error</h2>
                  <p className="text-sm text-graphite mt-1">Fallos recientes que requieren revision.</p>
                </div>
                <Link href="/dashboard/automatizaciones?status=failed&range=month" className="text-xs font-medium text-azure px-3 py-1.5 rounded-pill hover:bg-azure/5">
                  Revisar
                </Link>
              </div>
              <div className="divide-y divide-silver-mist">
                {operations.failed.map((delivery) => (
                  <div key={delivery.id} className="py-3 grid grid-cols-1 md:grid-cols-[1fr_160px] gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{delivery.publisherName} / {delivery.assignmentTitle}</p>
                      <p className="text-xs text-red-600 truncate">{delivery.errorMessage || 'Error sin detalle del proveedor'}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-pill self-start justify-self-start md:justify-self-end ${statusClasses[delivery.status] || 'bg-red-50 text-red-700'}`}>
                      {delivery.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

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
