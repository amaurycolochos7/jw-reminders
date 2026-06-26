'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

type Severity = 'critical' | 'warning' | 'info'

interface NamedItem {
  id: string
  name: string
}

interface ProgramItem {
  id: string
  name: string
  year: number
  month: number
  status: string
  weekCount: number
  assignmentCount: number
  proposedCount: number
  templateCount: number
  deliveryCount: number
  pending: number
  failed: number
  completion: number
}

interface WeekItem {
  id: string
  status: string
  meetingDate: string
  meetingDateLocal: string
  meetingTime: string
  programId: string | null
  programName: string | null
  assignmentCount: number
  templateCount: number
  deliveryCount: number
  pending: number
  failed: number
  completion: number
}

interface DeliveryItem {
  id: string
  status: string
  reminderType: string
  recipientRole: string
  scheduledAt: string
  localDate: string
  localTime: string
  publisherName: string
  assignmentTitle: string
  assignmentId: string
  meetingWeekId: string | null
  programId: string | null
  programName: string | null
  errorMessage: string | null
}

interface DeliverySummary {
  total: number
  pending: number
  queued: number
  sending: number
  sent: number
  failed: number
  skipped: number
  cancelled: number
  dead: number
  assigned: number
  companions: number
  items: DeliveryItem[]
}

interface CalendarDay {
  date: string
  day: number
  isToday: boolean
  meetings: Array<{ id: string; time: string; status: string; programName: string | null }>
  deliveries: DeliveryItem[]
  programs: Array<{ id: string; name: string; status: string }>
  meetingCount: number
  deliveryCount: number
  programCount: number
}

interface OperationalCenter {
  generatedAt: string
  timezone: string
  sendHour: number
  todayLocal: string
  system: {
    database: { status: string; label: string }
    worker: { status: string; label: string; lastEventAt: string | null }
    scheduler: { status: string; label: string; schedule: string }
    whatsapp: { status: string; label: string; ready: boolean; connectedNumber: string | null; deviceName: string | null; lastConnected: string | null; lastDisconnected: string | null; error: string | null }
    testMode: { enabled: boolean; phone: string | null }
    lastSyncAt: string
    lastMessage: { id: string; status: string; at: string; publisherName: string; messageType: string } | null
  }
  programs: {
    active: ProgramItem[]
    pending: ProgramItem[]
    incomplete: ProgramItem[]
    archived: ProgramItem[]
    totals: { active: number; pending: number; incomplete: number; archived: number }
  }
  weeks: {
    active: WeekItem[]
    pending: WeekItem[]
    incomplete: WeekItem[]
    ready: WeekItem[]
    totals: { active: number; pending: number; incomplete: number; ready: number }
  }
  proposals: {
    pending: ProgramItem[]
    approved: number
    discarded: number
    totals: { pending: number; approved: number; discarded: number }
  }
  automations: {
    today: DeliverySummary
    tomorrow: DeliverySummary
    nextSeven: DeliverySummary
    overdue: DeliverySummary
    failed: DeliverySummary
    cancelled: DeliverySummary
  }
  publishers: {
    active: NamedItem[]
    inactive: NamedItem[]
    new: NamedItem[]
    withoutPhone: NamedItem[]
    withoutAssignmentPermission: NamedItem[]
    withoutCompanionPermission: NamedItem[]
    totals: { active: number; inactive: number; new: number; withoutPhone: number; withoutAssignmentPermission: number; withoutCompanionPermission: number }
  }
  flow: {
    steps: Array<{ key: string; label: string; done: boolean }>
    currentStep: { key: string; label: string; done: boolean }
    nextAction: { label: string; href: string }
  }
  alerts: Array<{ id: string; severity: Severity; title: string; detail: string; actionLabel: string; href: string }>
  calendar: { month: string; selectedDate: string; days: CalendarDay[] }
  answers: { today: string; wrong: string; next: string; completed: string; attention: string }
}

const reminderLabels: Record<string, string> = {
  INITIAL_NOTICE: 'Aviso inicial',
  SEVEN_DAYS_BEFORE: '7 dias',
  THREE_DAYS_BEFORE: '3 dias',
  ONE_DAY_BEFORE: '1 dia',
  SAME_DAY: 'Mismo dia',
  CHANGE_NOTICE: 'Cambio',
  CANCELLATION_NOTICE: 'Cancelacion',
}

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  READY: 'Lista',
  COMPLETED: 'Completado',
  ARCHIVED: 'Archivado',
  CANCELLED: 'Cancelado',
  PENDING: 'Pendiente',
  QUEUED: 'En cola',
  SENDING: 'Enviando',
  SENT: 'Enviado',
  FAILED: 'Fallido',
  SKIPPED: 'Omitido',
  DEAD: 'Agotado',
}

const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const shortMonths = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function formatDate(value: string) {
  const datePart = value.split('T')[0]
  const [year, month, day] = datePart.split('-').map(Number)
  return `${day} ${shortMonths[month - 1]} ${year}`
}

function formatDateTime(value: string | null) {
  if (!value) return 'Sin registro'
  return new Date(value).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function monthTitle(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${monthNames[monthNumber - 1]} ${year}`
}

function firstWeekday(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('es-MX').format(value)
}

function bucketLine(bucket: DeliverySummary) {
  if (bucket.total === 0) return 'Sin mensajes programados'
  return `${bucket.total} mensajes / ${bucket.assigned} asignados / ${bucket.companions} acompanantes`
}

function toneClasses(tone: 'ok' | 'attention' | 'neutral' | 'action') {
  if (tone === 'action') return 'bg-azure text-white'
  if (tone === 'attention') return 'bg-fog text-caution border border-silver-mist'
  if (tone === 'ok') return 'bg-fog text-ink border border-silver-mist'
  return 'bg-fog text-graphite border border-silver-mist'
}

function statusTone(status: string): 'ok' | 'attention' | 'neutral' | 'action' {
  if (['FAILED', 'DEAD', 'CANCELLED', 'attention', 'DISCONNECTED', 'QR_REQUIRED'].includes(status)) return 'attention'
  if (['PENDING', 'QUEUED', 'SENDING', 'DRAFT', 'READY'].includes(status)) return 'action'
  if (['SENT', 'ACTIVE', 'COMPLETED', 'connected', 'running', 'configured', 'READY'].includes(status)) return 'ok'
  return 'neutral'
}

function StateBadge({ value, label }: { value: string; label?: string }) {
  const tone = statusTone(value)
  return (
    <span className={`inline-flex items-center justify-center rounded-pill px-3 py-1 text-[11px] font-medium ${toneClasses(tone)}`}>
      {label || statusLabels[value] || value}
    </span>
  )
}

function Panel({ title, eyebrow, action, children, className = '' }: { title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-card p-5 sm:p-7 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow && <p className="text-xs font-medium text-graphite">{eyebrow}</p>}
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function ActionLink({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-9 items-center justify-center rounded-pill px-4 text-sm font-medium transition-opacity hover:opacity-80 ${primary ? 'bg-azure text-white' : 'bg-fog text-ink border border-silver-mist'}`}
    >
      {children}
    </Link>
  )
}

function MetricTile({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="bg-white rounded-card p-5">
      <p className="text-xs font-medium text-graphite">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{typeof value === 'number' ? compactNumber(value) : value}</p>
      {note && <p className="mt-2 text-xs text-graphite">{note}</p>}
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="h-2 w-full rounded-pill bg-fog overflow-hidden">
      <div className="h-full rounded-pill bg-ink" style={{ width: `${pct}%` }} />
    </div>
  )
}

function ProgramList({ items, empty, actionLabel }: { items: ProgramItem[]; empty: string; actionLabel: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-graphite">{empty}</p>

  return (
    <div className="divide-y divide-silver-mist">
      {items.slice(0, 5).map((program) => (
        <Link key={program.id} href={`/dashboard/programas/${program.id}`} className="grid gap-3 py-4 hover:opacity-80 md:grid-cols-[1fr_120px_120px] md:items-center">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{program.name}</p>
            <p className="mt-1 text-xs text-graphite">{program.weekCount} semanas / {program.assignmentCount} asignaciones / {program.deliveryCount} entregas</p>
          </div>
          <div>
            <ProgressBar value={program.completion} />
            <p className="mt-1 text-xs text-graphite">{program.completion}%</p>
          </div>
          <span className="justify-self-start rounded-pill bg-fog px-3 py-1 text-xs font-medium text-ink md:justify-self-end">{actionLabel}</span>
        </Link>
      ))}
    </div>
  )
}

function WeekList({ items, empty }: { items: WeekItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-graphite">{empty}</p>

  return (
    <div className="divide-y divide-silver-mist">
      {items.slice(0, 6).map((week) => (
        <Link key={week.id} href={`/dashboard/semanas/${week.id}`} className="grid gap-3 py-4 hover:opacity-80 md:grid-cols-[1fr_140px_92px] md:items-center">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{week.programName || 'Sin programa'} / {formatDate(week.meetingDateLocal || week.meetingDate)}</p>
            <p className="mt-1 text-xs text-graphite">{week.meetingTime} / {week.assignmentCount} asignaciones / {week.pending} pendientes</p>
          </div>
          <div>
            <ProgressBar value={week.completion} />
            <p className="mt-1 text-xs text-graphite">{week.completion}% completo</p>
          </div>
          <StateBadge value={week.failed > 0 ? 'FAILED' : week.status} />
        </Link>
      ))}
    </div>
  )
}

function DeliveryList({ items, empty }: { items: DeliveryItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-graphite">{empty}</p>

  return (
    <div className="divide-y divide-silver-mist">
      {items.map((delivery) => (
        <Link key={delivery.id} href="/dashboard/automatizaciones" className="grid gap-3 py-3 hover:opacity-80 sm:grid-cols-[64px_1fr_auto] sm:items-center">
          <p className="text-sm font-semibold text-ink">{delivery.localTime}</p>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{delivery.publisherName}</p>
            <p className="truncate text-xs text-graphite">{delivery.assignmentTitle} / {reminderLabels[delivery.reminderType] || delivery.reminderType}</p>
            {delivery.errorMessage && <p className="mt-1 truncate text-xs text-caution">{delivery.errorMessage}</p>}
          </div>
          <StateBadge value={delivery.status} label={delivery.recipientRole === 'COMPANION' ? 'Acompanante' : 'Asignado'} />
        </Link>
      ))}
    </div>
  )
}

function SystemPanel({ center }: { center: OperationalCenter }) {
  const rows = [
    { label: 'Sistema', value: center.system.database.label, status: center.system.database.status },
    { label: 'Worker', value: center.system.worker.label, status: center.system.worker.status },
    { label: 'Scheduler', value: center.system.scheduler.schedule, status: center.system.scheduler.status },
    { label: 'WhatsApp', value: center.system.whatsapp.label, status: center.system.whatsapp.status },
    { label: 'TEST_MODE', value: center.system.testMode.enabled ? 'Activo' : 'Inactivo', status: center.system.testMode.enabled ? 'DRAFT' : 'COMPLETED' },
    { label: 'Ultima sincronizacion', value: formatDateTime(center.system.lastSyncAt), status: 'COMPLETED' },
    { label: 'Ultimo envio', value: center.system.lastMessage ? `${center.system.lastMessage.publisherName} / ${formatDateTime(center.system.lastMessage.at)}` : 'Sin mensajes', status: center.system.lastMessage?.status || 'SKIPPED' },
  ]

  return (
    <Panel title="Estado general" eyebrow={`${center.timezone} / envio ${String(center.sendHour).padStart(2, '0')}:00`}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-card bg-fog p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-graphite">{row.label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-ink">{row.value}</p>
              </div>
              <StateBadge value={row.status} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function AnswerStrip({ center }: { center: OperationalCenter }) {
  const answers = [
    { label: 'Que debo hacer hoy', value: center.answers.today },
    { label: 'Que esta mal', value: center.answers.wrong },
    { label: 'Que sigue', value: center.answers.next },
    { label: 'Que ya termino', value: center.answers.completed },
    { label: 'Requiere atencion', value: center.answers.attention },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-5">
      {answers.map((answer) => (
        <div key={answer.label} className="bg-white rounded-card p-5">
          <p className="text-xs font-medium text-graphite">{answer.label}</p>
          <p className="mt-2 text-sm font-semibold text-ink">{answer.value}</p>
        </div>
      ))}
    </div>
  )
}

function AlertsPanel({ alerts }: { alerts: OperationalCenter['alerts'] }) {
  if (alerts.length === 0) {
    return (
      <Panel title="Alertas" eyebrow="Atencion operativa">
        <div className="rounded-card bg-fog p-5">
          <p className="text-sm font-semibold text-ink">Sin alertas abiertas</p>
          <p className="mt-1 text-sm text-graphite">No hay fallos, bloqueos ni datos incompletos detectados.</p>
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="Alertas" eyebrow={`${alerts.length} asunto(s) por revisar`}>
      <div className="grid gap-3">
        {alerts.slice(0, 7).map((alert) => (
          <Link key={alert.id} href={alert.href} className="block rounded-card bg-fog p-5 hover:opacity-80">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <StateBadge value={alert.severity === 'critical' ? 'FAILED' : alert.severity === 'warning' ? 'PENDING' : 'SKIPPED'} label={alert.severity === 'critical' ? 'Critica' : alert.severity === 'warning' ? 'Revision' : 'Info'} />
                <p className="mt-3 text-sm font-semibold text-ink">{alert.title}</p>
                <p className="mt-1 text-sm text-graphite">{alert.detail}</p>
              </div>
              <span className="text-sm font-medium text-ink">{alert.actionLabel}</span>
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  )
}

function FlowPanel({ center }: { center: OperationalCenter }) {
  return (
    <Panel
      title="Flujo recomendado"
      eyebrow="Proceso diario"
      action={<ActionLink href={center.flow.nextAction.href} primary>{center.flow.nextAction.label}</ActionLink>}
    >
      <div className="grid gap-3">
        {center.flow.steps.map((step, index) => (
          <div key={step.key} className="grid grid-cols-[28px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span className={`flex h-7 w-7 items-center justify-center rounded-pill text-xs font-semibold ${step.done ? 'bg-ink text-white' : 'bg-fog text-graphite border border-silver-mist'}`}>
                {index + 1}
              </span>
              {index < center.flow.steps.length - 1 && <span className="mt-2 h-6 w-px bg-silver-mist" />}
            </div>
            <div className="pb-3">
              <p className="text-sm font-semibold text-ink">{step.label}</p>
              <p className="mt-1 text-xs text-graphite">{step.done ? 'Completado' : step.key === center.flow.currentStep.key ? 'Siguiente paso' : 'Pendiente'}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function QuickActions() {
  const actions = [
    { label: 'Crear programa', href: '/dashboard/programas' },
    { label: 'Importar programa', href: '/dashboard/importar' },
    { label: 'Crear semana', href: '/dashboard/semanas' },
    { label: 'Ver propuestas', href: '/dashboard/programas' },
    { label: 'Ver automatizaciones', href: '/dashboard/automatizaciones' },
    { label: 'Ir a WhatsApp', href: '/dashboard/whatsapp' },
    { label: 'Ver historial', href: '/dashboard/historial' },
  ]

  return (
    <Panel title="Acciones rapidas" eyebrow="Atajos operativos">
      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <ActionLink key={action.href} href={action.href} primary={index === 0}>{action.label}</ActionLink>
        ))}
      </div>
    </Panel>
  )
}

function AutomationPanel({ center }: { center: OperationalCenter }) {
  const buckets = [
    { label: 'Hoy', data: center.automations.today, href: '/dashboard/automatizaciones?range=today' },
    { label: 'Manana', data: center.automations.tomorrow, href: '/dashboard/automatizaciones?range=tomorrow' },
    { label: 'Proximas 7', data: center.automations.nextSeven, href: '/dashboard/automatizaciones?range=week' },
    { label: 'Vencidas', data: center.automations.overdue, href: '/dashboard/automatizaciones?range=week' },
    { label: 'Fallidas', data: center.automations.failed, href: '/dashboard/automatizaciones?status=failed&range=month' },
    { label: 'Canceladas', data: center.automations.cancelled, href: '/dashboard/automatizaciones?status=cancelled&range=month' },
  ]

  return (
    <Panel title="Automatizaciones" eyebrow="Entregas programadas">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {buckets.map((bucket) => (
          <Link key={bucket.label} href={bucket.href} className="rounded-card bg-fog p-4 hover:opacity-80">
            <p className="text-xs font-medium text-graphite">{bucket.label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{bucket.data.total}</p>
            <p className="mt-1 text-xs text-graphite">{bucketLine(bucket.data)}</p>
          </Link>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Hoy</h3>
          <DeliveryList items={center.automations.today.items} empty="No saldran mensajes hoy" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Fallidas</h3>
          <DeliveryList items={center.automations.failed.items} empty="Sin fallos abiertos" />
        </div>
      </div>
    </Panel>
  )
}

function ProgramsPanel({ center }: { center: OperationalCenter }) {
  return (
    <Panel title="Programas" eyebrow="Mensuales" action={<ActionLink href="/dashboard/programas" primary>Crear programa</ActionLink>}>
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricTile label="Activos" value={center.programs.totals.active} />
        <MetricTile label="Pendientes" value={center.programs.totals.pending} />
        <MetricTile label="Incompletos" value={center.programs.totals.incomplete} />
        <MetricTile label="Archivados" value={center.programs.totals.archived} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Activos o incompletos</h3>
          <ProgramList items={[...center.programs.active, ...center.programs.incomplete]} empty="Sin programas activos" actionLabel="Ver" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Pendientes y archivados</h3>
          <ProgramList items={[...center.programs.pending, ...center.programs.archived]} empty="Sin programas pendientes" actionLabel="Editar" />
        </div>
      </div>
    </Panel>
  )
}

function WeeksPanel({ center }: { center: OperationalCenter }) {
  return (
    <Panel title="Semanas" eyebrow="Avance por reunion" action={<ActionLink href="/dashboard/semanas">Crear semana</ActionLink>}>
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricTile label="Activas" value={center.weeks.totals.active} />
        <MetricTile label="Pendientes" value={center.weeks.totals.pending} />
        <MetricTile label="Incompletas" value={center.weeks.totals.incomplete} />
        <MetricTile label="Listas" value={center.weeks.totals.ready} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Incompletas</h3>
          <WeekList items={center.weeks.incomplete} empty="No hay semanas incompletas" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Listas</h3>
          <WeekList items={center.weeks.ready} empty="No hay semanas listas" />
        </div>
      </div>
    </Panel>
  )
}

function ProposalsPanel({ center }: { center: OperationalCenter }) {
  return (
    <Panel title="Propuestas" eyebrow="Pendientes de decision" action={<ActionLink href="/dashboard/programas">Ver propuestas</ActionLink>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label="Pendientes" value={center.proposals.totals.pending} />
        <MetricTile label="Aprobadas" value={center.proposals.totals.approved} />
        <MetricTile label="Descartadas" value={center.proposals.totals.discarded} />
      </div>
      <div className="mt-5">
        <ProgramList items={center.proposals.pending} empty="Sin propuestas pendientes" actionLabel="Revisar" />
      </div>
    </Panel>
  )
}

function PublishersPanel({ center }: { center: OperationalCenter }) {
  const groups = [
    { label: 'Activos', total: center.publishers.totals.active, items: center.publishers.active },
    { label: 'Inactivos', total: center.publishers.totals.inactive, items: center.publishers.inactive },
    { label: 'Nuevos', total: center.publishers.totals.new, items: center.publishers.new },
    { label: 'Sin telefono', total: center.publishers.totals.withoutPhone, items: center.publishers.withoutPhone },
    { label: 'Sin permiso asignaciones', total: center.publishers.totals.withoutAssignmentPermission, items: center.publishers.withoutAssignmentPermission },
    { label: 'Sin permiso acompanante', total: center.publishers.totals.withoutCompanionPermission, items: center.publishers.withoutCompanionPermission },
  ]

  return (
    <Panel title="Publicadores" eyebrow="Disponibilidad" action={<ActionLink href="/dashboard/publicadores">Ver publicadores</ActionLink>}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <Link key={group.label} href="/dashboard/publicadores" className="rounded-card bg-fog p-4 hover:opacity-80">
            <p className="text-xs font-medium text-graphite">{group.label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{group.total}</p>
            <p className="mt-2 truncate text-xs text-graphite">{group.items.length > 0 ? group.items.map((item) => item.name).join(', ') : 'Sin casos'}</p>
          </Link>
        ))}
      </div>
    </Panel>
  )
}

function OperationalCalendar({ center, selectedDate, onSelectDate }: { center: OperationalCenter; selectedDate: string; onSelectDate: (date: string) => void }) {
  const blanks = firstWeekday(center.calendar.month)
  const selected = center.calendar.days.find((day) => day.date === selectedDate) || center.calendar.days[0]
  const weekdayLabels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

  return (
    <Panel title="Calendario operativo" eyebrow={monthTitle(center.calendar.month)}>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="grid grid-cols-7 gap-2">
            {weekdayLabels.map((label) => (
              <p key={label} className="pb-1 text-center text-[11px] font-medium text-graphite">{label}</p>
            ))}
            {Array.from({ length: blanks }).map((_, index) => (
              <div key={`blank-${index}`} className="min-h-24 rounded-card bg-fog/60" />
            ))}
            {center.calendar.days.map((day) => {
              const isSelected = day.date === selected.date
              const hasWork = day.meetingCount + day.deliveryCount + day.programCount > 0
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => onSelectDate(day.date)}
                  className={`min-h-24 rounded-card p-3 text-left transition-opacity hover:opacity-80 ${isSelected ? 'bg-ink text-white' : 'bg-fog text-ink'}`}
                >
                  <span className="text-sm font-semibold">{day.day}</span>
                  <div className="mt-3 space-y-1">
                    {day.meetingCount > 0 && <p className={`truncate text-[11px] ${isSelected ? 'text-white' : 'text-ink'}`}>{day.meetingCount} reunion</p>}
                    {day.deliveryCount > 0 && <p className={`truncate text-[11px] ${isSelected ? 'text-white' : 'text-graphite'}`}>{day.deliveryCount} mensajes</p>}
                    {day.programCount > 0 && <p className={`truncate text-[11px] ${isSelected ? 'text-white' : 'text-graphite'}`}>{day.programCount} programa</p>}
                    {!hasWork && <p className={`text-[11px] ${isSelected ? 'text-white' : 'text-graphite'}`}>Libre</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div className="rounded-card bg-fog p-5">
          <p className="text-sm font-semibold text-ink">{formatDate(selected.date)}</p>
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-xs font-medium text-graphite">Reuniones</p>
              {selected.meetings.length === 0 ? <p className="mt-2 text-sm text-graphite">Sin reunion registrada</p> : (
                <div className="mt-2 space-y-2">
                  {selected.meetings.map((meeting) => (
                    <Link key={meeting.id} href={`/dashboard/semanas/${meeting.id}`} className="block rounded-card bg-white p-4">
                      <p className="text-sm font-semibold text-ink">{meeting.time} / {meeting.programName || 'Sin programa'}</p>
                      <p className="mt-1 text-xs text-graphite">{statusLabels[meeting.status] || meeting.status}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-graphite">Mensajes</p>
              <div className="mt-2">
                <DeliveryList items={selected.deliveries.slice(0, 8)} empty="Sin mensajes ese dia" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-graphite">Programas</p>
              {selected.programs.length === 0 ? <p className="mt-2 text-sm text-graphite">Sin inicio de programa</p> : (
                <div className="mt-2 space-y-2">
                  {selected.programs.map((program) => (
                    <Link key={program.id} href={`/dashboard/programas/${program.id}`} className="block rounded-card bg-white p-4">
                      <p className="text-sm font-semibold text-ink">{program.name}</p>
                      <p className="mt-1 text-xs text-graphite">{statusLabels[program.status] || program.status}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [center, setCenter] = useState<OperationalCenter | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [loadError, setLoadError] = useState('')

  const loadData = useCallback(async () => {
    try {
      const res = await api('/api/dashboard')
      if (!res.ok) throw new Error('No se pudo cargar el Centro Operativo')
      const data = await res.json()
      if (!data.operationalCenter) throw new Error('Respuesta operativa incompleta')
      setCenter(data.operationalCenter)
      setSelectedDate((current) => current || data.operationalCenter.calendar.selectedDate)
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el Centro Operativo')
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

  const heroMetrics = useMemo(() => {
    if (!center) return []
    return [
      { label: 'Mensajes hoy', value: center.automations.today.total, note: `${center.automations.today.assigned} asignados / ${center.automations.today.companions} acompanantes` },
      { label: 'Fallidas', value: center.automations.failed.total, note: 'Requieren revision' },
      { label: 'Propuestas', value: center.proposals.totals.pending, note: 'Pendientes de aprobar' },
      { label: 'Semanas incompletas', value: center.weeks.totals.incomplete, note: 'Faltan datos o entregas' },
    ]
  }, [center])

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-16 rounded-card bg-white" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-card bg-white" />)}
        </div>
        <div className="h-80 rounded-card bg-white" />
      </div>
    )
  }

  if (!center) {
    return (
      <div className="rounded-card bg-white p-7">
        <h1 className="text-2xl font-semibold text-ink">Centro Operativo</h1>
        <p className="mt-3 text-sm text-caution">{loadError || 'No se pudo cargar la informacion operativa.'}</p>
        <button type="button" onClick={loadData} className="mt-5 rounded-pill bg-azure px-5 py-2.5 text-sm font-medium text-white">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-card bg-white p-6 sm:p-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-medium text-graphite">Dashboard principal</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-5xl">Centro Operativo</h1>
            <p className="mt-3 max-w-3xl text-base text-graphite">
              Una sola vista para decidir que hacer hoy, que esta mal, que sigue, que ya termino y que requiere atencion.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <ActionLink href={center.flow.nextAction.href} primary>{center.flow.nextAction.label}</ActionLink>
            <ActionLink href="/dashboard/automatizaciones">Automatizaciones</ActionLink>
          </div>
        </div>
      </div>

      {loadError && <div className="rounded-card bg-white p-4 text-sm text-caution">{loadError}</div>}

      <AnswerStrip center={center} />

      <div className="grid gap-3 md:grid-cols-4">
        {heroMetrics.map((metric) => (
          <MetricTile key={metric.label} label={metric.label} value={metric.value} note={metric.note} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <SystemPanel center={center} />
        <AlertsPanel alerts={center.alerts} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <FlowPanel center={center} />
        <AutomationPanel center={center} />
      </div>

      <OperationalCalendar center={center} selectedDate={selectedDate || center.calendar.selectedDate} onSelectDate={setSelectedDate} />

      <div className="grid gap-5 xl:grid-cols-2">
        <ProgramsPanel center={center} />
        <WeeksPanel center={center} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <ProposalsPanel center={center} />
        <PublishersPanel center={center} />
      </div>

      <QuickActions />
    </div>
  )
}
