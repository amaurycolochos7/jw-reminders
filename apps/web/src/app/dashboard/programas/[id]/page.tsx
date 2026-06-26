'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import ConfirmModal from '@/components/ConfirmModal'

interface Week {
  id: string
  weekStartDate: string
  weekStartDateLocal: string | null
  meetingDate: string
  meetingDateLocal: string | null
  meetingTime: string
  congregationName: string | null
  status: string
  assignmentCount: number
  automationPlanCount: number
  total: number
  pending: number
  sent: number
  failed: number
  cancelled: number
  completion: number
}

interface Metrics {
  totalWeeks: number
  activeWeeks: number
  totalAssignments: number
  totalAutomations: number
  automationPlanCount: number
  pending: number
  sent: number
  failed: number
  cancelled: number
  skipped: number
  completion: number
}

interface ProgramDetail {
  id: string
  year: number
  month: number
  name: string
  status: string
  archivedAt: string | null
  cancelledAt: string | null
  completedAt: string | null
  metrics: Metrics
  weeks: Week[]
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WEEK_DAYS = [
  { value: 0, label: 'Domingo' }, { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' }, { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sabado' },
]

const PROGRAM_STATUS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-amber-50 text-amber-700' },
  ACTIVE: { label: 'Activo', className: 'bg-emerald-50 text-emerald-700' },
  COMPLETED: { label: 'Completado', className: 'bg-azure/10 text-azure' },
  ARCHIVED: { label: 'Archivado', className: 'bg-fog text-graphite' },
  CANCELLED: { label: 'Cancelado', className: 'bg-red-50 text-red-700' },
}

const WEEK_STATUS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-amber-50 text-amber-700' },
  READY: { label: 'Lista', className: 'bg-fog text-azure' },
  ACTIVE: { label: 'Activa', className: 'bg-emerald-50 text-emerald-700' },
  COMPLETED: { label: 'Completada', className: 'bg-fog text-graphite' },
  ARCHIVED: { label: 'Archivada', className: 'bg-fog text-graphite' },
  CANCELLED: { label: 'Cancelada', className: 'bg-red-50 text-red-700' },
}

function formatDate(iso: string): string {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${months[m - 1]} ${y}`
}
function formatDateShort(iso: string): string {
  const [datePart] = iso.split('T')
  const [, m, d] = datePart.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d}-${months[m - 1]}`
}

type ConfirmState = {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  tone?: 'default' | 'danger' | 'warning'
  run: () => Promise<void>
} | null

export default function ProgramDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [program, setProgram] = useState<ProgramDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [weekForm, setWeekForm] = useState({ meetingDayOfWeek: 5, meetingTime: '19:00' })

  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const [editWeek, setEditWeek] = useState<Week | null>(null)
  const [editForm, setEditForm] = useState({ meetingDate: '', meetingTime: '' })
  const [savingWeek, setSavingWeek] = useState(false)
  const [editError, setEditError] = useState('')

  function notify(type: 'success' | 'error', text: string) {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/monthly-schedules/${id}`)
      if (res.status === 404) { setNotFound(true); return }
      if (res.ok) setProgram(await res.json())
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function runAction(key: string, fn: () => Promise<Response>, successText: (data: any) => string) {
    setBusy(key)
    try {
      const res = await fn()
      const data = await res.json().catch(() => ({}))
      if (res.ok) { notify('success', successText(data)); await load() }
      else notify('error', data.error || 'No se pudo completar la accion')
    } catch { notify('error', 'Error de conexion') } finally { setBusy('') }
  }

  // ─── Program-level actions ─────────────────────────────
  function askGenerateWeeks() {
    setConfirm({
      title: 'Generar semanas del mes',
      description: (
        <>Se crearan las semanas de reunion de <strong className="text-ink">{program?.name}</strong> en{' '}
        <strong className="text-ink">{WEEK_DAYS.find((d) => d.value === Number(weekForm.meetingDayOfWeek))?.label}</strong> a las{' '}
        <strong className="text-ink">{weekForm.meetingTime}</strong>. Las semanas ya existentes no se duplican.</>
      ),
      confirmLabel: 'Generar semanas',
      run: () => runAction('weeks', () => api(`/api/monthly-schedules/${id}/generate-weeks`, {
        method: 'POST',
        body: JSON.stringify({ meetingDayOfWeek: Number(weekForm.meetingDayOfWeek), meetingTime: weekForm.meetingTime }),
      }), (d) => `${d.created || 0} semanas generadas (${d.totalMeetingDates || 0} fechas de reunion en el mes)`),
    })
  }

  function askGenerateAutomations() {
    setConfirm({
      title: 'Generar automatizaciones',
      description: <>Se generaran los recordatorios de todas las asignaciones sin automatizacion en las semanas activas del programa.</>,
      confirmLabel: 'Generar',
      run: () => runAction('gen', () => api(`/api/monthly-schedules/${id}/generate-automations`, { method: 'POST' }),
        (d) => `${d.created || 0} recordatorios generados en ${d.plans || 0} planes${d.skipped ? `, ${d.skipped} ya tenian` : ''}`),
    })
  }

  function askRegenerate() {
    setConfirm({
      title: 'Regenerar pendientes',
      description: <>Se reemplazaran los planes activos por versiones nuevas y se cancelaran los recordatorios pendientes actuales. Los mensajes ya enviados no se modifican.</>,
      confirmLabel: 'Regenerar',
      tone: 'warning',
      run: () => runAction('regen', () => api(`/api/monthly-schedules/${id}/regenerate-pending`, { method: 'POST' }),
        (d) => `${d.created || 0} recordatorios regenerados (${d.superseded || 0} planes reemplazados)`),
    })
  }

  function askCancelPending() {
    setConfirm({
      title: 'Cancelar pendientes',
      description: <>Se cancelaran todos los recordatorios pendientes del programa. Esta accion no borra el historial ni los mensajes ya enviados.</>,
      confirmLabel: 'Cancelar pendientes',
      tone: 'danger',
      run: () => runAction('cancel', () => api(`/api/monthly-schedules/${id}/cancel-pending`, { method: 'POST' }),
        (d) => `${d.cancelled || 0} recordatorios cancelados`),
    })
  }

  function askComplete() {
    setConfirm({
      title: 'Marcar como completado',
      description: <>El programa <strong className="text-ink">{program?.name}</strong> se marcara como completado. Podras seguir consultando su historial.</>,
      confirmLabel: 'Marcar completado',
      run: () => runAction('complete', () => api(`/api/monthly-schedules/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'COMPLETED' }) }),
        () => 'Programa marcado como completado'),
    })
  }

  function askArchive() {
    setConfirm({
      title: 'Archivar programa',
      description: <>El programa <strong className="text-ink">{program?.name}</strong> se archivara. Se conserva todo el historial de semanas, asignaciones y mensajes.</>,
      confirmLabel: 'Archivar',
      tone: 'warning',
      run: () => runAction('archive', () => api(`/api/monthly-schedules/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'ARCHIVED' }) }),
        () => 'Programa archivado'),
    })
  }

  // ─── Week-level actions ────────────────────────────────
  function askGenerateWeek(week: Week) {
    setConfirm({
      title: 'Generar automatizaciones de la semana',
      description: <>Se generaran los recordatorios de las asignaciones de la semana del <strong className="text-ink">{formatDateShort(week.weekStartDate)}</strong>.</>,
      confirmLabel: 'Generar',
      run: () => runAction(`weekgen-${week.id}`, () => api(`/api/meeting-weeks/${week.id}/generate-automations`, { method: 'POST' }),
        (d) => `${d.created || 0} recordatorios generados${d.skipped ? `, ${d.skipped} ya tenian` : ''}`),
    })
  }

  function askArchiveWeek(week: Week) {
    const hasHistory = week.assignmentCount > 0 || week.total > 0
    setConfirm({
      title: hasHistory ? 'Archivar semana' : 'Eliminar semana',
      description: hasHistory
        ? <>La semana del <strong className="text-ink">{formatDateShort(week.weekStartDate)}</strong> tiene asignaciones o automatizaciones, por lo que se archivara y se conservara el historial.</>
        : <>La semana del <strong className="text-ink">{formatDateShort(week.weekStartDate)}</strong> esta vacia y se eliminara de forma permanente.</>,
      confirmLabel: hasHistory ? 'Archivar' : 'Eliminar',
      tone: hasHistory ? 'warning' : 'danger',
      run: () => runAction(`weekarch-${week.id}`, () => api(`/api/meeting-weeks/${week.id}`, { method: 'DELETE' }), () => hasHistory ? 'Semana archivada' : 'Semana eliminada'),
    })
  }

  function openEditWeek(week: Week) {
    setEditWeek(week)
    setEditForm({ meetingDate: week.meetingDate.split('T')[0], meetingTime: week.meetingTime })
    setEditError('')
  }

  async function saveWeek(e: React.FormEvent) {
    e.preventDefault()
    if (!editWeek) return
    setSavingWeek(true)
    setEditError('')
    try {
      const res = await api(`/api/meeting-weeks/${editWeek.id}`, {
        method: 'PUT',
        body: JSON.stringify({ meetingDate: `${editForm.meetingDate}T00:00:00.000Z`, meetingTime: editForm.meetingTime }),
      })
      if (res.ok) { setEditWeek(null); notify('success', 'Semana actualizada'); await load() }
      else { const d = await res.json(); setEditError(d.error || 'No se pudo guardar') }
    } catch { setEditError('Error de conexion') } finally { setSavingWeek(false) }
  }

  async function handleConfirm() {
    if (!confirm) return
    setConfirmLoading(true)
    try { await confirm.run() } finally { setConfirmLoading(false); setConfirm(null) }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-56 bg-silver-mist rounded-pill" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-card" />)}</div>
        <div className="h-64 bg-white rounded-card" />
      </div>
    )
  }

  if (notFound || !program) {
    return (
      <div className="bg-white rounded-card p-7 text-center py-16">
        <p className="text-sm text-graphite">Programa no encontrado</p>
        <Link href="/dashboard/programas" className="inline-block mt-4 bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill">Volver a programas</Link>
      </div>
    )
  }

  const meta = PROGRAM_STATUS[program.status] || { label: program.status, className: 'bg-fog text-graphite' }
  const m = program.metrics
  const readOnly = program.status === 'ARCHIVED' || program.status === 'CANCELLED'
  const metricCards: { label: string; value: number; accent?: string }[] = [
    { label: 'Semanas', value: m.totalWeeks },
    { label: 'Asignaciones', value: m.totalAssignments },
    { label: 'Automatizaciones', value: m.totalAutomations },
    { label: 'Pendientes', value: m.pending },
    { label: 'Enviadas', value: m.sent, accent: 'text-emerald-600' },
    { label: 'Fallidas', value: m.failed, accent: m.failed > 0 ? 'text-red-600' : undefined },
    { label: 'Canceladas', value: m.cancelled },
    { label: 'Completitud', value: m.completion, accent: 'text-azure' },
  ]

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Link href="/dashboard/programas" className="text-xs text-graphite hover:text-ink transition-colors inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Programas
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap mt-2">
          <div>
            <h1 className="text-2xl font-semibold text-ink tracking-tight">{program.name}</h1>
            <p className="text-sm text-graphite mt-1">{MONTHS[program.month - 1]} {program.year}</p>
          </div>
          <span className={`text-xs font-medium px-3 py-1.5 rounded-pill ${meta.className}`}>{meta.label}</span>
        </div>
      </div>

      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{toast.text}</div>
      )}

      {/* Completion bar */}
      <div className="bg-white rounded-card p-5 sm:p-7">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ink">Completitud del programa</span>
          <span className="text-sm font-semibold text-ink">{m.completion}%</span>
        </div>
        <div className="h-2 bg-fog rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${m.completion === 100 ? 'bg-emerald-500' : 'bg-azure'}`} style={{ width: `${m.completion}%` }} />
        </div>
        <p className="text-xs text-graphite mt-2">{m.activeWeeks} de {m.totalWeeks} semanas activas / {m.automationPlanCount} planes de automatizacion</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metricCards.map((card) => (
          <div key={card.label} className="bg-white rounded-card p-4 sm:p-5">
            <p className="text-xs text-graphite">{card.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${card.accent || 'text-ink'}`}>{card.value}{card.label === 'Completitud' ? '%' : ''}</p>
          </div>
        ))}
      </div>

      {/* Bulk actions */}
      <div className="bg-white rounded-card p-5 sm:p-7 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Acciones del programa</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={askGenerateAutomations} disabled={readOnly || busy === 'gen'} className="bg-azure text-white text-xs font-medium px-4 py-2 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
            {busy === 'gen' ? 'Generando...' : 'Generar automatizaciones'}
          </button>
          <button onClick={askRegenerate} disabled={readOnly || busy === 'regen'} className="text-caution text-xs font-medium px-4 py-2 rounded-pill border border-silver-mist hover:bg-fog transition-colors disabled:opacity-50">
            {busy === 'regen' ? 'Regenerando...' : 'Regenerar pendientes'}
          </button>
          <button onClick={askCancelPending} disabled={readOnly || busy === 'cancel'} className="text-red-600 text-xs font-medium px-4 py-2 rounded-pill border border-silver-mist hover:bg-red-50 transition-colors disabled:opacity-50">
            {busy === 'cancel' ? 'Cancelando...' : 'Cancelar pendientes'}
          </button>
          <Link href={`/dashboard/automatizaciones?range=month&monthlyScheduleId=${program.id}`} className="text-graphite text-xs font-medium px-4 py-2 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
            Ver agenda en Centro de Automatizaciones
          </Link>
          {program.status !== 'COMPLETED' && (
            <button onClick={askComplete} disabled={readOnly || busy === 'complete'} className="text-emerald-700 text-xs font-medium px-4 py-2 rounded-pill border border-silver-mist hover:bg-emerald-50 transition-colors disabled:opacity-50">
              Marcar completado
            </button>
          )}
          <button onClick={askArchive} disabled={readOnly || busy === 'archive'} className="text-graphite text-xs font-medium px-4 py-2 rounded-pill border border-silver-mist hover:bg-fog transition-colors disabled:opacity-50">
            Archivar programa
          </button>
        </div>
        {readOnly && <p className="text-xs text-graphite">Este programa esta {meta.label.toLowerCase()}; las acciones de edicion estan deshabilitadas.</p>}
      </div>

      {/* Generate weeks */}
      {!readOnly && (
        <div className="bg-white rounded-card p-5 sm:p-7">
          <h2 className="text-sm font-semibold text-ink mb-4">Generar semanas del mes</h2>
          <div className="grid grid-cols-1 md:grid-cols-[180px_140px_auto] gap-3 md:items-end">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Dia de reunion</label>
              <select value={weekForm.meetingDayOfWeek} onChange={(e) => setWeekForm({ ...weekForm, meetingDayOfWeek: Number(e.target.value) })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
                {WEEK_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Hora</label>
              <input type="time" value={weekForm.meetingTime} onChange={(e) => setWeekForm({ ...weekForm, meetingTime: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm" />
            </div>
            <button onClick={askGenerateWeeks} disabled={busy === 'weeks'} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
              {busy === 'weeks' ? 'Generando...' : 'Generar semanas'}
            </button>
          </div>
          <p className="text-xs text-graphite mt-2">No se duplican las semanas que ya existen en el programa.</p>
        </div>
      )}

      {/* Weeks */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Semanas del programa</h2>
        {program.weeks.length === 0 ? (
          <div className="bg-white rounded-card p-7 text-center py-12">
            <p className="text-sm text-graphite">Aun no hay semanas. Genera las semanas del mes para empezar.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-3 lg:hidden">
              {program.weeks.map((week) => {
                const ws = WEEK_STATUS[week.status] || { label: week.status, className: 'bg-fog text-graphite' }
                return (
                  <div key={week.id} className="bg-white rounded-card p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">Semana del {formatDateShort(week.weekStartDate)}</span>
                      <span className={`text-[11px] font-medium px-2.5 py-1 rounded-pill flex-shrink-0 ${ws.className}`}>{ws.label}</span>
                    </div>
                    <p className="text-xs text-graphite mt-1">Reunion: {formatDate(week.meetingDate)} a las {week.meetingTime}</p>
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1"><span className="text-xs text-graphite">Completitud</span><span className="text-xs font-medium text-ink">{week.completion}%</span></div>
                      <div className="h-1.5 bg-fog rounded-full overflow-hidden"><div className={`h-full rounded-full ${week.completion === 100 ? 'bg-emerald-500' : 'bg-azure'}`} style={{ width: `${week.completion}%` }} /></div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                      <div className="bg-fog rounded-xl py-2"><p className="text-sm font-semibold text-ink">{week.assignmentCount}</p><p className="text-[10px] text-graphite">Asign.</p></div>
                      <div className="bg-fog rounded-xl py-2"><p className="text-sm font-semibold text-ink">{week.pending}</p><p className="text-[10px] text-graphite">Pend.</p></div>
                      <div className="bg-fog rounded-xl py-2"><p className="text-sm font-semibold text-ink">{week.sent}</p><p className="text-[10px] text-graphite">Env.</p></div>
                      <div className="bg-fog rounded-xl py-2"><p className={`text-sm font-semibold ${week.failed > 0 ? 'text-red-600' : 'text-ink'}`}>{week.failed}</p><p className="text-[10px] text-graphite">Fall.</p></div>
                    </div>
                    {renderWeekActions(week)}
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block bg-white rounded-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-silver-mist">
                      <th className="text-left px-5 py-4 font-medium text-graphite">Semana</th>
                      <th className="text-left px-5 py-4 font-medium text-graphite">Reunion</th>
                      <th className="text-left px-5 py-4 font-medium text-graphite">Estado</th>
                      <th className="text-left px-5 py-4 font-medium text-graphite">Asign.</th>
                      <th className="text-left px-5 py-4 font-medium text-graphite">Pend.</th>
                      <th className="text-left px-5 py-4 font-medium text-graphite">Env.</th>
                      <th className="text-left px-5 py-4 font-medium text-graphite">Fall.</th>
                      <th className="text-left px-5 py-4 font-medium text-graphite">Compl.</th>
                      <th className="text-left px-5 py-4 font-medium text-graphite">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {program.weeks.map((week) => {
                      const ws = WEEK_STATUS[week.status] || { label: week.status, className: 'bg-fog text-graphite' }
                      return (
                        <tr key={week.id} className="border-b border-silver-mist last:border-0">
                          <td className="px-5 py-4 text-ink font-medium">{formatDateShort(week.weekStartDate)}</td>
                          <td className="px-5 py-4 text-graphite">{formatDate(week.meetingDate)} {week.meetingTime}</td>
                          <td className="px-5 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-pill ${ws.className}`}>{ws.label}</span></td>
                          <td className="px-5 py-4 text-graphite">{week.assignmentCount}</td>
                          <td className="px-5 py-4 text-graphite">{week.pending}</td>
                          <td className="px-5 py-4 text-graphite">{week.sent}</td>
                          <td className={`px-5 py-4 ${week.failed > 0 ? 'text-red-600' : 'text-graphite'}`}>{week.failed}</td>
                          <td className="px-5 py-4 text-graphite">{week.completion}%</td>
                          <td className="px-5 py-4">{renderWeekActions(week)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit week modal */}
      {editWeek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setEditWeek(null)}>
          <div className="bg-white rounded-card p-7 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">Editar semana del {formatDateShort(editWeek.weekStartDate)}</h2>
            {editError && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{editError}</p>}
            <form onSubmit={saveWeek} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Fecha de reunion</label>
                <input type="date" required value={editForm.meetingDate} onChange={(e) => setEditForm({ ...editForm, meetingDate: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Hora de reunion</label>
                <input type="time" required value={editForm.meetingTime} onChange={(e) => setEditForm({ ...editForm, meetingTime: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <p className="text-xs text-graphite">Si la fecha u hora cambian, los recordatorios programados de esta semana se regeneran automaticamente.</p>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={savingWeek} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">{savingWeek ? 'Guardando...' : 'Guardar'}</button>
                <button type="button" onClick={() => setEditWeek(null)} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm !== null}
        title={confirm?.title || ''}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        loading={confirmLoading}
        onConfirm={handleConfirm}
        onCancel={() => !confirmLoading && setConfirm(null)}
      />
    </div>
  )

  function renderWeekActions(week: Week) {
    const isInactive = week.status === 'ARCHIVED' || week.status === 'CANCELLED'
    return (
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-silver-mist lg:mt-0 lg:pt-0 lg:border-0">
        <button onClick={() => router.push(`/dashboard/semanas/${week.id}`)} className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-azure/5 transition-colors">Ver semana</button>
        {!readOnly && !isInactive && (
          <>
            <button onClick={() => openEditWeek(week)} className="text-graphite text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-fog transition-colors">Editar</button>
            <button onClick={() => askGenerateWeek(week)} disabled={busy === `weekgen-${week.id}`} className="text-graphite text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-fog transition-colors disabled:opacity-50">Generar autom.</button>
            <button onClick={() => askArchiveWeek(week)} disabled={busy === `weekarch-${week.id}`} className="text-graphite text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-fog transition-colors disabled:opacity-50">{week.assignmentCount > 0 || week.total > 0 ? 'Archivar' : 'Eliminar'}</button>
          </>
        )}
      </div>
    )
  }
}
