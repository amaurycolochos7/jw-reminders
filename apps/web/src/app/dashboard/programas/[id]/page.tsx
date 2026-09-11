'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import ConfirmModal from '@/components/ConfirmModal'
import WeekGenerationModal from './WeekGenerationModal'

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
  const [showWeekGen, setShowWeekGen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  function notify(type: 'success' | 'error', text: string) {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/monthly-schedules/${id}`)
      if (res.status === 404) { setNotFound(true); return }
      if (res.ok) setProgram(await res.json())
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function runAction(key: string, fn: () => Promise<Response>, successText: (data: any) => string) {
    setBusy(key)
    try {
      const res = await fn()
      const data = await res.json().catch(() => ({}))
      if (res.ok) { notify('success', successText(data)); await load() }
      else notify('error', data.error || 'No se pudo completar la accion')
    } catch { notify('error', 'Error de conexion') } finally { setBusy('') }
  }

  async function downloadS140() {
    setBusy('s140')
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/monthly-schedules/${id}/export/s140`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Error desconocido' }))
        notify('error', data.error || 'No se pudo generar el documento S-140')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('content-disposition')
      const filenameMatch = disposition?.match(/filename="([^"]+)"/)
      a.download = filenameMatch ? filenameMatch[1] : 'S-140.docx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      notify('success', 'Documento S-140 descargado')
    } catch { notify('error', 'Error de conexion al generar S-140') }
    finally { setBusy('') }
  }

  function askGenerateWeeks() { setShowWeekGen(true) }

  function askGenerateAutomations() {
    setConfirm({ title: 'Generar automatizaciones', description: <>Se generaran los recordatorios de todas las asignaciones sin automatizacion en las semanas activas del programa.</>, confirmLabel: 'Generar',
      run: () => runAction('gen', () => api(`/api/monthly-schedules/${id}/generate-automations`, { method: 'POST' }), (d) => `${d.created || 0} recordatorios generados en ${d.plans || 0} planes${d.skipped ? `, ${d.skipped} ya tenian` : ''}`),
    })
  }
  function askRegenerate() {
    setConfirm({ title: 'Regenerar pendientes', description: <>Se reemplazaran los planes activos por versiones nuevas y se cancelaran los recordatorios pendientes actuales. Los mensajes ya enviados no se modifican.</>, confirmLabel: 'Regenerar', tone: 'warning',
      run: () => runAction('regen', () => api(`/api/monthly-schedules/${id}/regenerate-pending`, { method: 'POST' }), (d) => `${d.created || 0} recordatorios regenerados (${d.superseded || 0} planes reemplazados)`),
    })
  }
  function askCancelPending() {
    setConfirm({ title: 'Cancelar pendientes', description: <>Se cancelaran todos los recordatorios pendientes del programa. Esta accion no borra el historial ni los mensajes ya enviados.</>, confirmLabel: 'Cancelar pendientes', tone: 'danger',
      run: () => runAction('cancel', () => api(`/api/monthly-schedules/${id}/cancel-pending`, { method: 'POST' }), (d) => `${d.cancelled || 0} recordatorios cancelados`),
    })
  }
  function askComplete() {
    setConfirm({ title: 'Marcar como completado', description: <>El programa se marcara como completado. Podras seguir consultando su historial.</>, confirmLabel: 'Marcar completado',
      run: () => runAction('complete', () => api(`/api/monthly-schedules/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'COMPLETED' }) }), () => 'Programa marcado como completado'),
    })
  }
  function askArchive() {
    setConfirm({ title: 'Archivar programa', description: <>El programa se archivara. Se conserva todo el historial.</>, confirmLabel: 'Archivar', tone: 'warning',
      run: () => runAction('archive', () => api(`/api/monthly-schedules/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'ARCHIVED' }) }), () => 'Programa archivado'),
    })
  }
  async function deleteProgram() {
    setBusy('delete')
    try {
      const res = await api(`/api/monthly-schedules/${id}?mode=delete`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { notify('success', 'Programa eliminado'); router.push('/dashboard/programas') }
      else notify('error', data.error || 'No se pudo eliminar el programa')
    } catch { notify('error', 'Error de conexion') } finally { setBusy('') }
  }
  function askDeleteProgram() {
    setConfirm({ title: 'Eliminar programa', description: <>Se eliminara <strong className="text-ink">de forma permanente</strong> este programa junto con todas sus semanas, asignaciones y recordatorios. Esta accion no se puede deshacer.</>, confirmLabel: 'Eliminar definitivamente', tone: 'danger', run: deleteProgram })
  }

  // Week actions
  function askGenerateWeek(week: Week) {
    setConfirm({ title: 'Generar automatizaciones de la semana', description: <>Se generaran los recordatorios de las asignaciones de la semana del <strong className="text-ink">{formatDateShort(week.weekStartDate)}</strong>.</>, confirmLabel: 'Generar',
      run: () => runAction(`weekgen-${week.id}`, () => api(`/api/meeting-weeks/${week.id}/generate-automations`, { method: 'POST' }), (d) => `${d.created || 0} recordatorios generados${d.skipped ? `, ${d.skipped} ya tenian` : ''}`),
    })
  }
  function askArchiveWeek(week: Week) {
    setConfirm({ title: 'Archivar semana', description: <>La semana del <strong className="text-ink">{formatDateShort(week.weekStartDate)}</strong> se archivara.</>, confirmLabel: 'Archivar', tone: 'warning',
      run: () => runAction(`weekarch-${week.id}`, () => api(`/api/meeting-weeks/${week.id}?mode=archive`, { method: 'DELETE' }), () => 'Semana archivada'),
    })
  }
  function askDeleteWeek(week: Week) {
    setConfirm({ title: 'Eliminar semana', description: <>Se eliminara <strong className="text-ink">de forma permanente</strong> la semana del <strong className="text-ink">{formatDateShort(week.weekStartDate)}</strong> junto con todas sus asignaciones y recordatorios.</>, confirmLabel: 'Eliminar definitivamente', tone: 'danger',
      run: () => runAction(`weekdel-${week.id}`, () => api(`/api/meeting-weeks/${week.id}?mode=delete`, { method: 'DELETE' }), () => 'Semana eliminada'),
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
    setSavingWeek(true); setEditError('')
    try {
      const res = await api(`/api/meeting-weeks/${editWeek.id}`, { method: 'PUT', body: JSON.stringify({ meetingDate: `${editForm.meetingDate}T00:00:00.000Z`, meetingTime: editForm.meetingTime }) })
      if (res.ok) { setEditWeek(null); notify('success', 'Semana actualizada'); await load() }
      else { const d = await res.json(); setEditError(d.error || 'No se pudo guardar') }
    } catch { setEditError('Error de conexion') } finally { setSavingWeek(false) }
  }
  async function handleConfirm() {
    if (!confirm) return
    setConfirmLoading(true)
    try { await confirm.run() } finally { setConfirmLoading(false); setConfirm(null) }
  }

  // ─── Loading / Not Found ─────────────────────────────────
  if (loading) return (
    <div className="mx-auto w-full max-w-5xl space-y-4 animate-pulse">
      <div className="h-10 w-48 bg-silver-mist/50 rounded-xl" />
      <div className="h-16 bg-white rounded-2xl" />
      <div className="h-32 bg-white rounded-2xl" />
    </div>
  )
  if (notFound || !program) return (
    <div className="mx-auto w-full max-w-5xl bg-white rounded-2xl p-12 text-center">
      <p className="text-sm text-graphite">Programa no encontrado</p>
      <Link href="/dashboard/programas" className="inline-block mt-4 bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-xl">Volver a programas</Link>
    </div>
  )

  const meta = PROGRAM_STATUS[program.status] || { label: program.status, className: 'bg-fog text-graphite' }
  const m = program.metrics
  const readOnly = program.status === 'ARCHIVED' || program.status === 'CANCELLED'

  // Progress summary text
  const progressText = m.totalWeeks === 0
    ? 'Aun no hay semanas creadas.'
    : m.totalAutomations === 0
      ? `${m.totalWeeks} semana${m.totalWeeks > 1 ? 's' : ''} creada${m.totalWeeks > 1 ? 's' : ''} · Sin recordatorios programados`
      : `${m.activeWeeks} de ${m.totalWeeks} semanas activas · ${m.totalAutomations} recordatorios programados`

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{toast.text}</div>
      )}

      {/* ━━━ A. HEADER COMPACTO ━━━ */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <Link href="/dashboard/programas" className="text-xs text-graphite hover:text-ink transition-colors inline-flex items-center gap-1 mb-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            Programas
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{MONTHS[program.month - 1]} {program.year}</h1>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${meta.className}`}>{meta.label}</span>
          </div>
          <p className="text-xs text-graphite mt-0.5">Programa mensual de reunion entre semana</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href={`/dashboard/programas/${program.id}/propuesta`} className="bg-azure text-white text-xs font-medium px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
            Abrir propuesta
          </Link>
          <button onClick={downloadS140} disabled={busy === 's140' || m.totalAssignments === 0} className="text-xs font-medium px-4 py-2 rounded-xl border border-silver-mist text-ink hover:bg-fog transition-colors disabled:opacity-40">
            {busy === 's140' ? 'Generando...' : 'Descargar S-140'}
          </button>
          {/* More actions menu */}
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(!menuOpen)} className="w-8 h-8 flex items-center justify-center rounded-xl border border-silver-mist text-graphite hover:bg-fog transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl border border-silver-mist shadow-lg z-50 py-1">
                <button onClick={() => { setMenuOpen(false); askGenerateAutomations() }} disabled={readOnly} className="w-full text-left px-4 py-2.5 text-xs text-ink hover:bg-fog transition-colors disabled:opacity-40">Generar automatizaciones</button>
                <button onClick={() => { setMenuOpen(false); askRegenerate() }} disabled={readOnly} className="w-full text-left px-4 py-2.5 text-xs text-ink hover:bg-fog transition-colors disabled:opacity-40">Regenerar pendientes</button>
                <button onClick={() => { setMenuOpen(false); askCancelPending() }} disabled={readOnly} className="w-full text-left px-4 py-2.5 text-xs text-ink hover:bg-fog transition-colors disabled:opacity-40">Cancelar pendientes</button>
                {program.status !== 'COMPLETED' && <button onClick={() => { setMenuOpen(false); askComplete() }} disabled={readOnly} className="w-full text-left px-4 py-2.5 text-xs text-ink hover:bg-fog transition-colors disabled:opacity-40">Marcar completado</button>}
                <button onClick={() => { setMenuOpen(false); askArchive() }} disabled={readOnly} className="w-full text-left px-4 py-2.5 text-xs text-ink hover:bg-fog transition-colors disabled:opacity-40">Archivar programa</button>
                <div className="border-t border-silver-mist my-1" />
                <button onClick={() => { setMenuOpen(false); askDeleteProgram() }} className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 transition-colors">Eliminar programa</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ B. AVANCE DEL PROGRAMA ━━━ */}
      <section className="bg-white rounded-2xl border border-silver-mist/60 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ink">Avance del programa</span>
          <span className="text-lg font-semibold text-ink">{m.completion}%</span>
        </div>
        <div className="h-1.5 bg-fog rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${m.completion === 100 ? 'bg-emerald-500' : 'bg-azure'}`} style={{ width: `${m.completion}%` }} />
        </div>
        <p className="text-xs text-graphite mt-2">{progressText}</p>
      </section>

      {/* ━━━ C. METRICAS COMPACTAS ━━━ */}
      <section className="bg-white rounded-[18px] border border-[#E8E8E8] px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:divide-x sm:divide-[#E8E8E8] gap-4 sm:gap-0">
          {/* Grupo A: Programa */}
          <div className="flex-1 sm:pr-5">
            <p className="text-[10px] font-medium text-graphite uppercase tracking-wider mb-2">Programa</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-lg font-semibold text-ink leading-none">{m.totalWeeks}</p>
                <p className="text-[11px] text-graphite mt-1">Semanas</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-ink leading-none">{m.totalAssignments}</p>
                <p className="text-[11px] text-graphite mt-1">Asignaciones</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-ink leading-none">{m.totalAutomations}</p>
                <p className="text-[11px] text-graphite mt-1">Recordatorios</p>
              </div>
            </div>
          </div>
          {/* Grupo B: Estado de avisos */}
          <div className="flex-1 sm:pl-5">
            <p className="text-[10px] font-medium text-graphite uppercase tracking-wider mb-2">Avisos</p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <p className={`text-lg font-semibold leading-none ${m.pending > 0 ? 'text-amber-600' : 'text-ink'}`}>{m.pending}</p>
                <p className="text-[11px] text-graphite mt-1">Pendientes</p>
              </div>
              <div>
                <p className={`text-lg font-semibold leading-none ${m.sent > 0 ? 'text-emerald-600' : 'text-ink'}`}>{m.sent}</p>
                <p className="text-[11px] text-graphite mt-1">Enviados</p>
              </div>
              <div>
                <p className={`text-lg font-semibold leading-none ${m.failed > 0 ? 'text-red-600' : 'text-graphite/60'}`}>{m.failed}</p>
                <p className={`text-[11px] mt-1 ${m.failed > 0 ? 'text-red-600' : 'text-graphite'}`}>Fallidos</p>
              </div>
              <div>
                <p className={`text-lg font-semibold leading-none ${m.cancelled > 0 ? 'text-ink' : 'text-graphite/60'}`}>{m.cancelled}</p>
                <p className="text-[11px] text-graphite mt-1">Cancelados</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ D. GENERAR SEMANAS ━━━ */}
      {!readOnly && (
        <section className="bg-white rounded-[18px] border border-[#E8E8E8] p-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-ink">Generar semanas</h3>
            <p className="text-[11px] text-graphite mt-0.5">Crea las semanas del mes usando el dia y horario de reunion.</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="w-full sm:w-[240px]">
              <label className="block text-[11px] font-medium text-graphite mb-1">Dia de reunion</label>
              <select value={weekForm.meetingDayOfWeek} onChange={(e) => setWeekForm({ ...weekForm, meetingDayOfWeek: Number(e.target.value) })} className="w-full h-[44px] px-3 border border-silver-mist rounded-xl text-sm bg-white">
                {WEEK_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
            </div>
            <div className="w-full sm:w-[150px]">
              <label className="block text-[11px] font-medium text-graphite mb-1">Hora</label>
              <input type="time" value={weekForm.meetingTime} onChange={(e) => setWeekForm({ ...weekForm, meetingTime: e.target.value })} className="w-full h-[44px] px-3 border border-silver-mist rounded-xl text-sm" />
            </div>
            <button onClick={askGenerateWeeks} disabled={busy === 'weeks'} className="w-full sm:w-auto bg-azure text-white text-sm font-medium h-[44px] px-6 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap">
              {busy === 'weeks' ? 'Generando...' : 'Generar semanas'}
            </button>
          </div>
          <p className="text-[11px] text-graphite mt-2.5">No se duplicaran semanas existentes.</p>
        </section>
      )}

      {/* ━━━ E. SEMANAS DEL PROGRAMA ━━━ */}
      <section>
        <h2 className="text-sm font-semibold text-ink mb-3">Semanas del programa</h2>
        {program.weeks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-silver-mist/60 p-10 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-fog flex items-center justify-center">
              <svg className="w-6 h-6 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
            </div>
            <p className="text-sm font-medium text-ink">Aun no hay semanas creadas</p>
            <p className="text-xs text-graphite mt-1">Genera las semanas del mes para comenzar a preparar asignaciones y recordatorios.</p>
            {!readOnly && (
              <button onClick={askGenerateWeeks} className="mt-4 bg-azure text-white text-xs font-medium px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
                Generar semanas
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile */}
            <div className="space-y-2 lg:hidden">
              {program.weeks.map((week) => {
                const ws = WEEK_STATUS[week.status] || { label: week.status, className: 'bg-fog text-graphite' }
                return (
                  <div key={week.id} className="bg-white rounded-2xl border border-silver-mist/60 p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-ink">Semana del {formatDateShort(week.weekStartDate)}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ws.className}`}>{ws.label}</span>
                    </div>
                    <p className="text-[11px] text-graphite">{formatDate(week.meetingDate)} · {week.meetingTime}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px]">
                      <span className="text-graphite">{week.assignmentCount} asign.</span>
                      {week.sent > 0 && <span className="text-emerald-600">{week.sent} env.</span>}
                      {week.pending > 0 && <span className="text-amber-600">{week.pending} pend.</span>}
                      {week.failed > 0 && <span className="text-red-600">{week.failed} fall.</span>}
                    </div>
                    {renderWeekActions(week)}
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block bg-white rounded-2xl border border-silver-mist/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-silver-mist/60 bg-fog/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-graphite">Semana</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-graphite">Reunion</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-graphite">Estado</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-graphite">Asign.</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-graphite">Pend.</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-graphite">Env.</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-graphite">Fall.</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-graphite">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {program.weeks.map((week) => {
                    const ws = WEEK_STATUS[week.status] || { label: week.status, className: 'bg-fog text-graphite' }
                    return (
                      <tr key={week.id} className="border-b border-silver-mist/40 last:border-0 hover:bg-fog/20 transition-colors">
                        <td className="px-4 py-3 text-ink font-medium">{formatDateShort(week.weekStartDate)}</td>
                        <td className="px-4 py-3 text-graphite text-xs">{formatDate(week.meetingDate)} {week.meetingTime}</td>
                        <td className="px-4 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ws.className}`}>{ws.label}</span></td>
                        <td className="px-3 py-3 text-center text-graphite">{week.assignmentCount}</td>
                        <td className={`px-3 py-3 text-center ${week.pending > 0 ? 'text-amber-600' : 'text-graphite'}`}>{week.pending}</td>
                        <td className={`px-3 py-3 text-center ${week.sent > 0 ? 'text-emerald-600' : 'text-graphite'}`}>{week.sent}</td>
                        <td className={`px-3 py-3 text-center ${week.failed > 0 ? 'text-red-600 font-medium' : 'text-graphite'}`}>{week.failed}</td>
                        <td className="px-4 py-3">{renderWeekActions(week)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ━━━ MODALS ━━━ */}
      {editWeek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setEditWeek(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink mb-4">Editar semana del {formatDateShort(editWeek.weekStartDate)}</h2>
            {editError && <p className="text-sm text-red-600 mb-3 p-3 bg-red-50 rounded-xl">{editError}</p>}
            <form onSubmit={saveWeek} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-graphite mb-1">Fecha de reunion</label>
                <input type="date" required value={editForm.meetingDate} onChange={(e) => setEditForm({ ...editForm, meetingDate: e.target.value })} className="w-full px-3 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-graphite mb-1">Hora de reunion</label>
                <input type="time" required value={editForm.meetingTime} onChange={(e) => setEditForm({ ...editForm, meetingTime: e.target.value })} className="w-full px-3 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <p className="text-[11px] text-graphite">Los recordatorios programados se regeneran automaticamente si cambia la fecha.</p>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={savingWeek} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50">{savingWeek ? 'Guardando...' : 'Guardar'}</button>
                <button type="button" onClick={() => setEditWeek(null)} className="text-sm text-graphite px-4 py-2.5 rounded-xl border border-silver-mist hover:bg-fog transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showWeekGen && (
        <WeekGenerationModal
          programId={program.id}
          programName={program.name}
          meetingDayOfWeek={Number(weekForm.meetingDayOfWeek)}
          meetingTime={weekForm.meetingTime}
          onClose={(reloaded) => { setShowWeekGen(false); if (reloaded) load() }}
        />
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
      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-silver-mist/40 lg:mt-0 lg:pt-0 lg:border-0">
        <button onClick={() => router.push(`/dashboard/semanas/${week.id}`)} className="text-azure text-[11px] font-medium px-2.5 py-1 rounded-lg hover:bg-azure/5 transition-colors">Ver</button>
        {!readOnly && !isInactive && (
          <>
            <button onClick={() => openEditWeek(week)} className="text-graphite text-[11px] font-medium px-2.5 py-1 rounded-lg hover:bg-fog transition-colors">Editar</button>
            <button onClick={() => askGenerateWeek(week)} disabled={busy === `weekgen-${week.id}`} className="text-graphite text-[11px] font-medium px-2.5 py-1 rounded-lg hover:bg-fog transition-colors disabled:opacity-40">Autom.</button>
          </>
        )}
        {!readOnly && (
          <button onClick={() => askDeleteWeek(week)} disabled={busy === `weekdel-${week.id}`} className="text-red-500 text-[11px] font-medium px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40">×</button>
        )}
      </div>
    )
  }
}
