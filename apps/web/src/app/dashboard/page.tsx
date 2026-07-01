'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { StatusDot } from '@/components/StatusDot'

// ─── Types (only what the home screen needs) ─────────────
type Severity = 'critical' | 'warning' | 'info'

interface WeekItem {
  id: string
  status: string
  meetingDate: string
  meetingDateLocal: string
  meetingTime: string
  programName: string | null
  assignmentCount: number
  pending: number
  failed: number
}

interface TodayAutomations {
  total: number
  pending: number
  queued: number
  sending: number
  sent: number
  failed: number
}

interface Alert {
  id: string
  severity: Severity
  title: string
  detail: string
  actionLabel: string
  href: string
}

interface OperationalCenter {
  todayLocal: string
  system: {
    worker: { status: string; label: string }
    whatsapp: { status: string; label: string; ready: boolean; connectedNumber: string | null }
    lastSyncAt: string
  }
  weeks: { thisWeek: WeekItem[] }
  automations: { today: TodayAutomations }
  alerts: Alert[]
}

// ─── Small helpers ───────────────────────────────────────
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const weekStatusLabels: Record<string, string> = {
  DRAFT: 'Borrador', READY: 'Lista', ACTIVE: 'Activa', COMPLETED: 'Completada',
}

function parseLocalDate(value: string) {
  const [y, m, d] = value.split('T')[0].split('-').map(Number)
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

function meetingHeadline(dateLocal: string) {
  const { d, m, dow } = parseLocalDate(dateLocal)
  return `${WEEKDAYS[dow]} ${d} ${MONTHS[m - 1]}`
}

function todayHeadline(dateLocal: string) {
  const { d, m, y, dow } = parseLocalDate(dateLocal)
  return `${WEEKDAYS[dow]} ${d} de ${MONTHS_LONG[m - 1]} de ${y}`
}

function waDot(status: string): 'green' | 'yellow' | 'red' {
  if (status === 'READY') return 'green'
  if (status === 'QR_REQUIRED') return 'yellow'
  return 'red'
}

function workerDot(status: string): 'green' | 'yellow' | 'red' {
  if (status === 'running') return 'green'
  if (status === 'attention') return 'yellow'
  return 'red'
}

function severityDot(severity: Severity): 'red' | 'yellow' | 'gray' {
  if (severity === 'critical') return 'red'
  if (severity === 'warning') return 'yellow'
  return 'gray'
}

function relativeSync(value: string) {
  if (!value) return 'Sin registro'
  const diffMs = Date.now() - new Date(value).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

// ─── UI atoms ────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-graphite">{children}</h2>
}

function StatusRow({ dot, label, value, pulse }: { dot: 'green' | 'yellow' | 'red' | 'gray'; label: string; value: string; pulse?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <StatusDot color={dot} pulse={pulse} />
        <span className="text-sm text-ink">{label}</span>
      </div>
      <span className="text-sm font-medium text-graphite">{value}</span>
    </div>
  )
}

function ActionButton({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex min-h-12 items-center justify-center rounded-2xl px-4 text-sm font-medium transition-opacity hover:opacity-90 ${primary ? 'bg-azure text-white' : 'bg-white text-ink border border-silver-mist'}`}
    >
      {children}
    </Link>
  )
}

// ─── Page ────────────────────────────────────────────────
export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [center, setCenter] = useState<OperationalCenter | null>(null)
  const [loadError, setLoadError] = useState('')

  const loadData = useCallback(async () => {
    try {
      const res = await api('/api/dashboard')
      if (!res.ok) throw new Error('No se pudo cargar el inicio')
      const data = await res.json()
      if (!data.operationalCenter) throw new Error('Respuesta incompleta del servidor')
      setCenter(data.operationalCenter)
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el inicio')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadData()
    }, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  const currentWeekHref = useMemo(() => {
    const first = center?.weeks?.thisWeek?.[0]
    return first ? `/dashboard/semanas/${first.id}` : '/dashboard/semanas'
  }, [center])

  const alerts = center?.alerts ?? []
  const thisWeekList = center?.weeks?.thisWeek ?? []
  const criticalAlert = alerts.find((a) => a.severity === 'critical') || null

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 animate-pulse">
        <div className="h-10 w-56 rounded-2xl bg-white" />
        <div className="h-40 rounded-3xl bg-white" />
        <div className="h-48 rounded-3xl bg-white" />
        <div className="h-28 rounded-3xl bg-white" />
      </div>
    )
  }

  if (!center) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-7">
        <h1 className="text-xl font-semibold text-ink">Inicio</h1>
        <p className="mt-3 text-sm text-caution">{loadError || 'No se pudo cargar la información.'}</p>
        <button type="button" onClick={loadData} className="mt-5 rounded-2xl bg-azure px-5 py-2.5 text-sm font-medium text-white">Reintentar</button>
      </div>
    )
  }

  const today = center.automations.today
  const todayPending = today.pending + today.queued + today.sending

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Inicio</h1>
        <p className="mt-1 text-sm text-graphite">{todayHeadline(center.todayLocal)}</p>
      </header>

      {/* Critical banner */}
      {criticalAlert && (
        <Link href={criticalAlert.href} className="flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 transition-opacity hover:opacity-90">
          <StatusDot color="red" pulse />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-red-700">{criticalAlert.title}</p>
            <p className="truncate text-xs text-red-600">{criticalAlert.detail}</p>
          </div>
          <span className="shrink-0 text-xs font-medium text-red-700">{criticalAlert.actionLabel}</span>
        </Link>
      )}

      {/* 1. ¿Funciona el sistema? */}
      <section className="rounded-3xl bg-white p-5 sm:p-6">
        <SectionTitle>Estado del sistema</SectionTitle>
        <div className="divide-y divide-silver-mist">
          <StatusRow
            dot={waDot(center.system.whatsapp.status)}
            pulse={!center.system.whatsapp.ready}
            label="WhatsApp"
            value={center.system.whatsapp.ready ? (center.system.whatsapp.connectedNumber || 'Conectado') : center.system.whatsapp.label}
          />
          <StatusRow dot={workerDot(center.system.worker.status)} label="Envíos automáticos" value={center.system.worker.label} />
          <StatusRow dot="gray" label="Última sincronización" value={relativeSync(center.system.lastSyncAt)} />
        </div>
      </section>

      {/* 2. ¿Qué reuniones tengo esta semana? */}
      <section className="rounded-3xl bg-white p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-graphite">Esta semana</h2>
          <Link href="/dashboard/semanas" className="text-xs font-medium text-azure hover:opacity-80">Ver todas</Link>
        </div>
        {thisWeekList.length === 0 ? (
          <div className="rounded-2xl bg-fog px-4 py-6 text-center">
            <p className="text-sm text-graphite">No hay reuniones esta semana.</p>
            <Link href="/dashboard/semanas" className="mt-3 inline-flex text-sm font-medium text-azure hover:opacity-80">Crear semana</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {thisWeekList.map((week) => (
              <div key={week.id} className="rounded-2xl border border-silver-mist p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-ink">{meetingHeadline(week.meetingDateLocal || week.meetingDate)}</p>
                    <p className="mt-0.5 text-sm text-graphite">Reunión entre semana · {week.meetingTime}</p>
                  </div>
                  <span className="shrink-0 rounded-pill bg-fog px-3 py-1 text-xs font-medium text-ink">
                    {weekStatusLabels[week.status] || week.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-graphite">
                    {week.failed > 0
                      ? `${week.failed} con error`
                      : week.pending > 0
                        ? `${week.pending} recordatorio(s) pendiente(s)`
                        : week.assignmentCount > 0
                          ? 'Sin pendientes'
                          : 'Sin asignaciones'}
                  </p>
                  <Link href={`/dashboard/semanas/${week.id}`} className="shrink-0 rounded-pill bg-azure px-4 py-1.5 text-xs font-medium text-white hover:opacity-90">
                    Ver semana
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. ¿Qué automatizaciones tengo hoy? */}
      <section className="rounded-3xl bg-white p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-graphite">Hoy</h2>
          <Link href="/dashboard/automatizaciones" className="text-xs font-medium text-azure hover:opacity-80">Ver automatizaciones</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Programadas', value: today.total },
            { label: 'Pendientes', value: todayPending },
            { label: 'Fallidas', value: today.failed, alert: today.failed > 0 },
            { label: 'Enviadas', value: today.sent },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-fog px-4 py-4 text-center">
              <p className={`text-3xl font-semibold ${stat.alert ? 'text-red-600' : 'text-ink'}`}>{stat.value}</p>
              <p className="mt-1 text-xs text-graphite">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. ¿Hay algo que requiere atención? */}
      <section className="rounded-3xl bg-white p-5 sm:p-6">
        <SectionTitle>Requiere atención</SectionTitle>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-fog px-4 py-4">
            <StatusDot color="green" />
            <p className="text-sm text-graphite">Todo en orden. No hay nada que requiera tu atención.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <Link key={alert.id} href={alert.href} className="flex items-start gap-3 rounded-2xl bg-fog px-4 py-3 transition-opacity hover:opacity-90">
                <span className="mt-1.5"><StatusDot color={severityDot(alert.severity)} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{alert.title}</p>
                  <p className="text-xs text-graphite">{alert.detail}</p>
                </div>
                <span className="mt-0.5 shrink-0 text-xs font-medium text-azure">{alert.actionLabel}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 5. Acciones rápidas */}
      <section>
        <SectionTitle>Acciones rápidas</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton href="/dashboard/programas" primary>Crear programa</ActionButton>
          <ActionButton href={currentWeekHref}>Ver semana actual</ActionButton>
          <ActionButton href="/dashboard/automatizaciones">Automatizaciones</ActionButton>
          <ActionButton href="/dashboard/whatsapp">WhatsApp</ActionButton>
        </div>
      </section>
    </div>
  )
}
