'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

interface Delivery {
  id: string
  reminderType: string
  recipientRole: string
  status: string
  scheduledAt: string
  sentAt: string | null
  localDate: string
  localTime: string
  overdue: boolean
  attemptCount: number
  maxAttempts: number
  nextRetryAt: string | null
  errorMessage: string | null
  publisher: { fullName: string; displayName: string | null } | null
  assignment: {
    id: string
    title: string
    assignmentNumber: number
    meetingWeekId: string
    meetingWeek: {
      id: string
      weekStartDate: string
      meetingDate: string
      monthlyScheduleId: string | null
      monthlySchedule: { id: string; name: string } | null
    }
  } | null
  lastAttempt: { errorMessage: string | null } | null
}

interface Group { label: string; localDate: string; deliveries: Delivery[] }
interface Summary { pending: number; queued: number; sending: number; sent: number; failed: number; skipped: number; cancelled: number; dead: number; overdue: number }
interface ResponseData { summary: Summary; groups: Group[]; range: { timezone: string } }

interface Overview {
  timezone: string
  sendHour: number
  today: { pending: number; assigned: number; companion: number }
  tomorrow: { pending: number }
  overdue: number
  failed: number
  sentToday: number
  programsWithPending: { id: string; name: string; pending: number }[]
  upcomingPublishers: { publisherId: string; name: string; count: number; nextLocalDate: string }[]
}

interface DeliveryDetail extends Delivery {
  automationPlan: { id: string; status: string; version: number } | null
  attempts: { id: string; status: string; phone: string; providerMessageId: string | null; errorMessage: string | null; sentAt: string | null; createdAt: string; messageBody: string }[]
}

interface Publisher { id: string; fullName: string; displayName: string | null }
interface MonthlySchedule { id: string; name: string }
interface Week { id: string; weekStartDate: string; monthlySchedule: { name: string } | null }

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente', QUEUED: 'En cola', SENDING: 'Enviando', SENT: 'Enviado',
  FAILED: 'Fallido', SKIPPED: 'Omitido', CANCELLED: 'Cancelado', DEAD: 'Agotado',
}
const STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700', QUEUED: 'bg-amber-50 text-amber-700', SENDING: 'bg-fog text-azure',
  SENT: 'bg-emerald-50 text-emerald-700', FAILED: 'bg-red-50 text-red-700', SKIPPED: 'bg-fog text-graphite',
  CANCELLED: 'bg-red-50 text-red-600', DEAD: 'bg-red-50 text-red-700',
}
const TYPE_LABELS: Record<string, string> = {
  INITIAL_NOTICE: 'Aviso inicial', SEVEN_DAYS_BEFORE: '7 dias antes', THREE_DAYS_BEFORE: '3 dias antes',
  ONE_DAY_BEFORE: '1 dia antes', SAME_DAY: 'Mismo dia', CHANGE_NOTICE: 'Aviso de cambio', CANCELLATION_NOTICE: 'Aviso de cancelacion',
}
const VIEWS = [
  { value: 'today', label: 'Hoy' },
  { value: 'tomorrow', label: 'Manana' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes (30 dias)' },
  { value: 'overdue', label: 'Vencidas / no enviadas' },
  { value: 'month-calendar', label: 'Mes calendario' },
  { value: 'custom', label: 'Rango personalizado' },
]

function formatDateShort(iso: string): string {
  const [d] = iso.split('T'); const [, m, day] = d.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${day}-${months[m - 1]}`
}
function formatDateTime(iso: string | null, tz: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function AutomatizacionesPage() {
  const initial = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const [view, setView] = useState(initial.get('range') || 'today')
  const [status, setStatus] = useState(initial.get('status') || '')
  const [role, setRole] = useState('')
  const [reminderType, setReminderType] = useState('')
  const [publisherId, setPublisherId] = useState('')
  const [monthlyScheduleId, setMonthlyScheduleId] = useState(initial.get('monthlyScheduleId') || '')
  const [meetingWeekId, setMeetingWeekId] = useState('')
  const [month, setMonth] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [programs, setPrograms] = useState<MonthlySchedule[]>([])
  const [weeks, setWeeks] = useState<Week[]>([])
  const [data, setData] = useState<ResponseData | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<DeliveryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function notify(type: 'success' | 'error', text: string) {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const buildParams = useCallback(() => {
    const params = new URLSearchParams()
    if (view === 'month-calendar' && month) params.set('month', month)
    else if (view === 'custom' && dateFrom && dateTo) { params.set('range', 'custom'); params.set('dateFrom', dateFrom); params.set('dateTo', dateTo) }
    else params.set('range', view)
    if (status) params.set('status', status)
    if (role) params.set('role', role)
    if (reminderType) params.set('reminderType', reminderType)
    if (publisherId) params.set('publisherId', publisherId)
    if (monthlyScheduleId) params.set('monthlyScheduleId', monthlyScheduleId)
    if (meetingWeekId) params.set('meetingWeekId', meetingWeekId)
    return params
  }, [view, month, dateFrom, dateTo, status, role, reminderType, publisherId, monthlyScheduleId, meetingWeekId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api(`/api/automation-center?${buildParams().toString()}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  const loadOverview = useCallback(async () => {
    const res = await api('/api/automation-center/overview')
    if (res.ok) setOverview(await res.json())
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadOverview() }, [loadOverview])

  useEffect(() => {
    async function loadFilters() {
      const [p, prog, w] = await Promise.all([api('/api/publishers'), api('/api/monthly-schedules'), api('/api/meeting-weeks')])
      if (p.ok) setPublishers(await p.json())
      if (prog.ok) setPrograms(await prog.json())
      if (w.ok) setWeeks(await w.json())
    }
    loadFilters()
  }, [])

  async function openDetail(id: string) {
    setDetailLoading(true)
    setDetail({ id } as DeliveryDetail)
    try {
      const res = await api(`/api/automation-center/deliveries/${id}`)
      if (res.ok) setDetail(await res.json())
      else { notify('error', 'No se pudo cargar el detalle'); setDetail(null) }
    } finally {
      setDetailLoading(false)
    }
  }

  async function retry(id: string) {
    setActionLoading(id)
    try {
      const res = await api(`/api/automation-center/deliveries/${id}/retry`, { method: 'POST' })
      const d = await res.json()
      if (res.ok) { notify('success', 'Reintento programado'); await load(); await loadOverview(); if (detail) await openDetail(id) }
      else notify('error', d.error || 'No se pudo reintentar')
    } catch { notify('error', 'Error de conexion') } finally { setActionLoading('') }
  }

  async function cancel(id: string) {
    setActionLoading(id)
    try {
      const res = await api(`/api/automation-center/deliveries/${id}/cancel`, { method: 'POST' })
      const d = await res.json()
      if (res.ok) { notify('success', 'Entrega cancelada'); await load(); await loadOverview(); if (detail) await openDetail(id) }
      else notify('error', d.error || 'No se pudo cancelar')
    } catch { notify('error', 'Error de conexion') } finally { setActionLoading('') }
  }

  const canRetry = (s: string) => s === 'FAILED' || s === 'DEAD'
  const canCancel = (s: string) => s === 'PENDING' || s === 'QUEUED' || s === 'FAILED'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Centro de Automatizaciones</h1>
        <p className="text-sm text-graphite mt-1">Supervisa y opera todos los mensajes programados, enviados, fallidos y vencidos.</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {toast.text}
        </div>
      )}

      {/* Operative summary */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button onClick={() => { setView('today'); setStatus('') }} className="bg-white rounded-card p-5 text-left hover:bg-fog/40 transition-colors">
            <p className="text-xs text-graphite">Hoy se enviaran</p>
            <p className="text-2xl font-semibold text-ink mt-1">{overview.today.pending}</p>
            <p className="text-[11px] text-graphite mt-0.5">{overview.today.assigned} asignados / {overview.today.companion} acomp.</p>
          </button>
          <button onClick={() => { setView('tomorrow'); setStatus('') }} className="bg-white rounded-card p-5 text-left hover:bg-fog/40 transition-colors">
            <p className="text-xs text-graphite">Manana</p>
            <p className="text-2xl font-semibold text-ink mt-1">{overview.tomorrow.pending}</p>
            <p className="text-[11px] text-graphite mt-0.5">pendientes</p>
          </button>
          <button onClick={() => { setView('overdue'); setStatus('') }} className="bg-white rounded-card p-5 text-left hover:bg-fog/40 transition-colors">
            <p className="text-xs text-graphite">Vencidas</p>
            <p className={`text-2xl font-semibold mt-1 ${overview.overdue > 0 ? 'text-red-600' : 'text-ink'}`}>{overview.overdue}</p>
            <p className="text-[11px] text-graphite mt-0.5">sin enviar</p>
          </button>
          <button onClick={() => { setView('month'); setStatus('failed') }} className="bg-white rounded-card p-5 text-left hover:bg-fog/40 transition-colors">
            <p className="text-xs text-graphite">Fallidas</p>
            <p className={`text-2xl font-semibold mt-1 ${overview.failed > 0 ? 'text-red-600' : 'text-ink'}`}>{overview.failed}</p>
            <p className="text-[11px] text-graphite mt-0.5">requieren accion</p>
          </button>
          <div className="bg-white rounded-card p-5">
            <p className="text-xs text-graphite">Enviadas hoy</p>
            <p className="text-2xl font-semibold text-emerald-600 mt-1">{overview.sentToday}</p>
            <p className="text-[11px] text-graphite mt-0.5">zona {overview.timezone}</p>
          </div>
        </div>
      )}

      {/* Programs with pending + upcoming publishers */}
      {overview && (overview.programsWithPending.length > 0 || overview.upcomingPublishers.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-card p-5 sm:p-7">
            <h2 className="text-sm font-semibold text-ink mb-3">Programas con pendientes</h2>
            {overview.programsWithPending.length === 0 ? (
              <p className="text-sm text-graphite">Ninguno</p>
            ) : (
              <ul className="space-y-2">
                {overview.programsWithPending.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <button onClick={() => { setMonthlyScheduleId(p.id); setView('month') }} className="text-sm text-azure hover:underline">{p.name}</button>
                    <span className="text-sm text-graphite">{p.pending} pendientes</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white rounded-card p-5 sm:p-7">
            <h2 className="text-sm font-semibold text-ink mb-3">Proximos publicadores (7 dias)</h2>
            {overview.upcomingPublishers.length === 0 ? (
              <p className="text-sm text-graphite">Ninguno</p>
            ) : (
              <ul className="space-y-2">
                {overview.upcomingPublishers.map((u) => (
                  <li key={u.publisherId} className="flex items-center justify-between gap-2">
                    <button onClick={() => { setPublisherId(u.publisherId); setView('week') }} className="text-sm text-azure hover:underline truncate">{u.name}</button>
                    <span className="text-xs text-graphite whitespace-nowrap">{u.count} / desde {u.nextLocalDate}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-card p-5 sm:p-7 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Vista</label>
            <select value={view} onChange={(e) => setView(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          {view === 'month-calendar' && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Mes</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm" />
            </div>
          )}
          {view === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Desde</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Hasta</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm" />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Estado</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="queued">En cola</option>
              <option value="sending">Enviando</option>
              <option value="sent">Enviado</option>
              <option value="failed">Fallido</option>
              <option value="skipped">Omitido</option>
              <option value="cancelled">Cancelado</option>
              <option value="dead">Agotado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Tipo</label>
            <select value={reminderType} onChange={(e) => setReminderType(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todos</option>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todos</option>
              <option value="assigned">Asignado</option>
              <option value="companion">Acompanante</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Publicador</label>
            <select value={publisherId} onChange={(e) => setPublisherId(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todos</option>
              {publishers.map((p) => <option key={p.id} value={p.id}>{p.displayName || p.fullName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Programa</label>
            <select value={monthlyScheduleId} onChange={(e) => setMonthlyScheduleId(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todos</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Semana</label>
            <select value={meetingWeekId} onChange={(e) => setMeetingWeekId(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todas</option>
              {weeks.map((w) => <option key={w.id} value={w.id}>{(w.monthlySchedule?.name ? w.monthlySchedule.name + ' / ' : '')}Sem {formatDateShort(w.weekStartDate)}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => { setStatus(''); setRole(''); setReminderType(''); setPublisherId(''); setMonthlyScheduleId(''); setMeetingWeekId(''); setView('today') }} className="text-xs font-medium text-graphite px-3 py-1.5 rounded-pill hover:bg-fog">
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Summary chips */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {([['pending', 'Pendientes'], ['sent', 'Enviadas'], ['failed', 'Fallidas'], ['cancelled', 'Canceladas'], ['overdue', 'Vencidas']] as const).map(([key, label]) => (
            <div key={key} className="bg-white rounded-card p-4">
              <p className="text-xs text-graphite">{label}</p>
              <p className={`text-xl font-semibold mt-1 ${key === 'overdue' && data.summary.overdue > 0 ? 'text-red-600' : 'text-ink'}`}>{data.summary[key] || 0}</p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="h-48 bg-white rounded-card animate-pulse" />
      ) : !data || data.groups.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <p className="text-sm text-graphite">No hay entregas para este filtro</p>
        </div>
      ) : (
        <div className="space-y-5">
          {data.groups.map((group) => (
            <section key={group.localDate} className="bg-white rounded-card overflow-hidden">
              <div className="px-5 py-4 border-b border-silver-mist flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{group.label}</h2>
                  <p className="text-xs text-graphite">{group.localDate} / {data.range.timezone}</p>
                </div>
                <span className="text-xs text-graphite">{group.deliveries.length} entregas</span>
              </div>
              <div className="divide-y divide-silver-mist">
                {group.deliveries.map((d) => (
                  <div key={d.id} className="px-5 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
                    <div className="lg:w-[70px] flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{d.localTime}</span>
                      {d.overdue && <span className="lg:hidden text-[10px] font-medium px-2 py-0.5 rounded-pill bg-red-50 text-red-600">Vencida</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{d.publisher?.displayName || d.publisher?.fullName || 'Sin publicador'}</p>
                      <p className="text-xs text-graphite mt-0.5 truncate">
                        {d.assignment ? `${d.assignment.assignmentNumber}. ${d.assignment.title}` : 'Sin asignacion'} / {TYPE_LABELS[d.reminderType] || d.reminderType}
                      </p>
                      <p className="text-xs text-graphite/80 mt-0.5 truncate">
                        {d.assignment?.meetingWeek?.monthlySchedule?.name || 'Sin programa'} / {d.recipientRole === 'COMPANION' ? 'Acompanante' : 'Asignado'}
                      </p>
                      {d.errorMessage && <p className="text-xs text-red-600 mt-1 truncate">{d.errorMessage}</p>}
                    </div>
                    <div className="flex items-center gap-2 lg:w-auto flex-wrap">
                      {d.overdue && <span className="hidden lg:inline text-[10px] font-medium px-2 py-0.5 rounded-pill bg-red-50 text-red-600">Vencida</span>}
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-pill ${STATUS_CLASSES[d.status] || 'bg-fog text-graphite'}`}>{STATUS_LABELS[d.status] || d.status}</span>
                      <button onClick={() => openDetail(d.id)} className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-azure/5 transition-colors">Detalle</button>
                      {canRetry(d.status) && (
                        <button onClick={() => retry(d.id)} disabled={actionLoading === d.id} className="text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-emerald-50 transition-colors disabled:opacity-50">Reintentar</button>
                      )}
                      {canCancel(d.status) && (
                        <button onClick={() => cancel(d.id)} disabled={actionLoading === d.id} className="text-red-600 text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-red-50 transition-colors disabled:opacity-50">Cancelar</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-card p-5 sm:p-7 w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-semibold text-ink tracking-tight">Detalle de automatizacion</h2>
                <p className="text-sm text-graphite mt-0.5">{detailLoading ? 'Cargando...' : `${TYPE_LABELS[detail.reminderType] || detail.reminderType}`}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-2 rounded-xl hover:bg-fog transition-colors" aria-label="Cerrar">
                <svg className="w-5 h-5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {detailLoading || !detail.status ? (
              <div className="space-y-3 animate-pulse">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-fog rounded-xl" />)}</div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><p className="text-xs text-graphite">Estado</p><span className={`inline-flex mt-1 text-xs font-medium px-2.5 py-1 rounded-pill ${STATUS_CLASSES[detail.status]}`}>{STATUS_LABELS[detail.status] || detail.status}</span></div>
                  <div><p className="text-xs text-graphite">Destinatario</p><p className="text-sm text-ink mt-1">{detail.publisher?.displayName || detail.publisher?.fullName || '—'}</p></div>
                  <div><p className="text-xs text-graphite">Rol</p><p className="text-sm text-ink mt-1">{detail.recipientRole === 'COMPANION' ? 'Acompanante' : 'Asignado'}</p></div>
                  <div><p className="text-xs text-graphite">Programado</p><p className="text-sm text-ink mt-1">{formatDateTime(detail.scheduledAt, detail.assignment ? (data?.range.timezone || 'America/Mexico_City') : 'America/Mexico_City')}</p></div>
                  <div><p className="text-xs text-graphite">Intentos</p><p className="text-sm text-ink mt-1">{detail.attemptCount} / {detail.maxAttempts}</p></div>
                  <div><p className="text-xs text-graphite">Plan</p><p className="text-sm text-ink mt-1">{detail.automationPlan ? `v${detail.automationPlan.version} (${detail.automationPlan.status})` : '—'}</p></div>
                </div>

                {detail.assignment && (
                  <div className="bg-fog rounded-xl p-4">
                    <p className="text-sm font-medium text-ink">{detail.assignment.assignmentNumber}. {detail.assignment.title}</p>
                    <p className="text-xs text-graphite mt-0.5">{detail.assignment.meetingWeek?.monthlySchedule?.name || 'Sin programa'}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Link href={`/dashboard/semanas/${detail.assignment.meetingWeekId}`} className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill bg-white hover:bg-azure/5 transition-colors">Ir a la semana</Link>
                      <Link href={`/dashboard/semanas/${detail.assignment.meetingWeekId}`} className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill bg-white hover:bg-azure/5 transition-colors">Ir a la asignacion</Link>
                      <Link href="/dashboard/programas" className="text-graphite text-xs font-medium px-3 py-1.5 rounded-pill bg-white hover:bg-fog transition-colors">Ir al programa</Link>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-ink mb-2">Historial de intentos</h3>
                  {detail.attempts.length === 0 ? (
                    <p className="text-sm text-graphite">Aun no hay intentos de envio registrados.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.attempts.map((a) => (
                        <div key={a.id} className="border border-silver-mist/70 rounded-xl px-4 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-pill ${a.status === 'SENT' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{a.status}</span>
                            <span className="text-xs text-graphite">{formatDateTime(a.createdAt, data?.range.timezone || 'America/Mexico_City')}</span>
                          </div>
                          <p className="text-xs text-graphite mt-1">Telefono: {a.phone}</p>
                          {a.errorMessage && <p className="text-xs text-red-600 mt-1">{a.errorMessage}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-silver-mist">
                  {canRetry(detail.status) && (
                    <button onClick={() => retry(detail.id)} disabled={actionLoading === detail.id} className="bg-emerald-500 text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">Reintentar envio</button>
                  )}
                  {canCancel(detail.status) && (
                    <button onClick={() => cancel(detail.id)} disabled={actionLoading === detail.id} className="bg-red-400 text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">Cancelar entrega</button>
                  )}
                  <button onClick={() => setDetail(null)} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">Cerrar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
