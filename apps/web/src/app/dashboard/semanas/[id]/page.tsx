'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { getAssignmentTypeRule, isInformationalType, typeHasNoDuration, typeNeedsCompanion } from '@/lib/assignment-rules'
import { importStatusMeta } from '@/lib/week-program'
import AssignmentForm, { type WeekPart } from './AssignmentForm'
import AssignmentReminders from './AssignmentReminders'
import WeekAutomations from './WeekAutomations'

// ─── Types ───────────────────────────────────────────────

interface Publisher {
  id: string
  fullName: string
  displayName: string | null
  phone: string
  isActive: boolean
  canReceiveAssignments: boolean
  canBeCompanion: boolean
  gender: string | null
  canBibleReading?: boolean
  canGiveTalk?: boolean
  canParticipateSMM?: boolean
  canBeChairman?: boolean
  canTreasures?: boolean
  canSpiritualGems?: boolean
  canChristianLife?: boolean
  canConductCBS?: boolean
  canReadCBS?: boolean
}

interface Assignment {
  id: string
  assignmentNumber: number
  section: string
  assignmentType: string
  title: string
  durationMinutes: number | null
  context: string | null
  reference: string | null
  room: string
  notes: string | null
  status: string
  assignedPublisherId: string
  companionPublisherId: string | null
  assigned: Publisher
  companion: Publisher | null
  reminders?: Reminder[]
}

interface Reminder {
  id: string
  publisherId: string
  reminderDay: string
  scheduledAt: string
  sentAt: string | null
  status: string
  publisher: Publisher
}

interface MeetingWeek {
  id: string
  weekStartDate: string
  meetingDate: string
  meetingTime: string
  congregationName: string | null
  notes: string | null
  status?: string
  monthlySchedule?: { id: string; name: string } | null
  assignments: Assignment[]
}

interface ProgramItem {
  id: string
  itemNumber: number | null
  section: string | null
  title: string
  assignmentType: string
  durationMinutes: number | null
  context: string | null
  description: string | null
  reference: string | null
  lesson: string | null
  requiresAssistant: boolean
  sourceUrl: string | null
}

interface WeekProgramData {
  id: string
  importStatus: string
  importedAt: string | null
  importError: string | null
  wolMeetingsUrl: string | null
  wolProgramUrl: string | null
  itemCount: number
  items: ProgramItem[]
}


// ─── Helpers ─────────────────────────────────────────────

function formatDate(iso: string): string {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${months[m - 1]} ${y}`
}

function monthName(iso: string): string {
  const [datePart] = iso.split('T')
  const m = Number(datePart.split('-')[1])
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return months[m - 1]
}

const SECTION_ORDER = [
  'OPENING', 'TREASURES', 'BIBLE_READING', 'APPLY_YOURSELF', 'LIVING_AS_CHRISTIANS', 'CONCLUSION',
] as const

function sectionLabel(section: string): string {
  const map: Record<string, string> = {
    OPENING: 'Inicio',
    TREASURES: 'Tesoros de la Biblia',
    BIBLE_READING: 'Lectura de la Biblia',
    APPLY_YOURSELF: 'Seamos Mejores Maestros',
    LIVING_AS_CHRISTIANS: 'Nuestra Vida Cristiana',
    CONCLUSION: 'Conclusión',
  }
  return map[section] || section
}

function typeLabel(type: string): string {
  return getAssignmentTypeRule(type).label
}

function groupAssignmentsBySection(assignments: Assignment[]): { section: string; items: Assignment[] }[] {
  const bySection = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const key = a.section || 'OTHER'
    if (!bySection.has(key)) bySection.set(key, [])
    bySection.get(key)!.push(a)
  }
  const orderIndex = (s: string) => {
    const i = (SECTION_ORDER as readonly string[]).indexOf(s)
    return i === -1 ? SECTION_ORDER.length : i
  }
  return Array.from(bySection.entries())
    .sort(([a], [b]) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map(([section, items]) => ({
      section,
      items: items.slice().sort((x, y) => x.assignmentNumber - y.assignmentNumber),
    }))
}

function roomLabel(room: string): string {
  return room === 'MAIN' ? 'Principal' : 'Auxiliar'
}

function statusVariant(status: string): { label: string; classes: string } {
  const map: Record<string, { label: string; classes: string }> = {
    DRAFT: { label: 'Borrador', classes: 'bg-amber-50 text-amber-700' },
    SCHEDULED: { label: 'Programada', classes: 'bg-fog text-azure' },
    CANCELLED: { label: 'Cancelada', classes: 'bg-red-50 text-red-700' },
    COMPLETED: { label: 'Completada', classes: 'bg-emerald-50 text-emerald-700' },
  }
  return map[status] || { label: status, classes: 'bg-fog text-graphite' }
}

function reminderStatusVariant(status: string): { label: string; classes: string } {
  const map: Record<string, { label: string; classes: string }> = {
    PENDING: { label: 'Pendiente', classes: 'bg-amber-50 text-amber-700' },
    QUEUED: { label: 'En cola', classes: 'bg-amber-50 text-amber-700' },
    SENDING: { label: 'Enviando', classes: 'bg-fog text-azure' },
    SENT: { label: 'Enviado', classes: 'bg-emerald-50 text-emerald-700' },
    FAILED: { label: 'Fallido', classes: 'bg-red-50 text-red-700' },
    DEAD: { label: 'Agotado', classes: 'bg-red-50 text-red-700' },
    CANCELLED: { label: 'Cancelado', classes: 'bg-red-50 text-red-600' },
    SKIPPED: { label: 'Omitido', classes: 'bg-fog text-graphite' },
  }
  return map[status] || { label: status, classes: 'bg-fog text-graphite' }
}

const WEEK_STATUS_LABEL: Record<string, string> = { DRAFT: 'Borrador', READY: 'Lista', ACTIVE: 'Activa', COMPLETED: 'Completada', ARCHIVED: 'Archivada', CANCELLED: 'Cancelada' }
const WEEK_STATUS_CLASS: Record<string, string> = { DRAFT: 'bg-amber-50 text-amber-700', READY: 'bg-emerald-50 text-emerald-700', ACTIVE: 'bg-emerald-50 text-emerald-700', COMPLETED: 'bg-fog text-graphite', ARCHIVED: 'bg-fog text-graphite', CANCELLED: 'bg-red-50 text-red-700' }


// ─── Page ────────────────────────────────────────────────

export default function SemanaDetallePage() {
  const params = useParams()
  const router = useRouter()
  const weekId = params.id as string

  const [week, setWeek] = useState<MeetingWeek | null>(null)
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [parts, setParts] = useState<WeekPart[]>([])
  const [programData, setProgramData] = useState<WeekProgramData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // UI state
  const [showForm, setShowForm] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [formInitialPartId, setFormInitialPartId] = useState<string | undefined>(undefined)
  const [viewingReminders, setViewingReminders] = useState<Assignment | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'cancel' | 'complete'; assignment: Assignment } | null>(null)
  const [showEditWeek, setShowEditWeek] = useState(false)
  const [editWeekForm, setEditWeekForm] = useState({ weekStartDate: '', meetingDate: '', meetingTime: '', congregationName: '', notes: '' })
  const [savingWeek, setSavingWeek] = useState(false)
  const [weekError, setWeekError] = useState('')
  const [generatingReminders, setGeneratingReminders] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showAllReminders, setShowAllReminders] = useState(false)
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set())
  const [showRemindersSection, setShowRemindersSection] = useState(false)
  const [retrying, setRetrying] = useState(false)

  // ─── Data Loading ────────────────────────────────────────

  const loadWeek = useCallback(async () => {
    try {
      const res = await api(`/api/meeting-weeks/${weekId}`)
      if (res.ok) setWeek(await res.json())
      else setError('No se pudo cargar la semana')
    } catch { setError('Error de conexion') } finally { setLoading(false) }
  }, [weekId])

  const loadPublishers = useCallback(async () => {
    try {
      const res = await api('/api/publishers')
      if (res.ok) {
        const data = await res.json()
        setPublishers(data.filter((p: Publisher) => p.isActive))
      }
    } catch { /* ignore */ }
  }, [])

  const loadProgram = useCallback(async () => {
    try {
      const res = await api(`/api/meeting-weeks/${weekId}/program`)
      if (res.ok) {
        const data = await res.json()
        setProgramData(data)
        setParts(Array.isArray(data.items) ? data.items : [])
      }
    } catch { /* ignore */ }
  }, [weekId])

  useEffect(() => { loadWeek(); loadPublishers(); loadProgram() }, [loadWeek, loadPublishers, loadProgram])

  // ─── Actions ─────────────────────────────────────────────

  async function retryImport() {
    setRetrying(true)
    try {
      const res = await api(`/api/meeting-weeks/${weekId}/import-wol`, { method: 'POST' })
      const d = await res.json()
      if (res.ok && d.status !== 'IMPORT_FAILED') {
        setNotification({ type: 'success', message: `Programa importado (${d.itemCount} partes)` })
      } else {
        setNotification({ type: 'error', message: d.error || 'No se pudo importar desde WOL' })
      }
    } catch { setNotification({ type: 'error', message: 'Error de conexión' }) } finally {
      setRetrying(false)
      await loadProgram()
      await loadWeek()
      setTimeout(() => setNotification(null), 4000)
    }
  }

  async function handleGenerateReminders(assignmentId: string) {
    setActionLoading(assignmentId)
    try {
      const res = await api(`/api/assignments/${assignmentId}/generate-reminders`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setNotification({ type: 'success', message: data.created > 0 ? `${data.created} recordatorios creados` : 'Esta asignación ya tiene recordatorios activos' })
        await loadWeek()
      } else {
        const data = await res.json()
        setNotification({ type: 'error', message: data.error || 'Error al generar recordatorios' })
      }
    } catch { setNotification({ type: 'error', message: 'Error de conexión' }) } finally {
      setActionLoading(null)
      setTimeout(() => setNotification(null), 4000)
    }
  }

  async function handleCancelAssignment() {
    if (!confirmAction || confirmAction.type !== 'cancel') return
    setActionLoading(confirmAction.assignment.id)
    try {
      const res = await api(`/api/assignments/${confirmAction.assignment.id}/cancel`, { method: 'PATCH' })
      if (res.ok) { setConfirmAction(null); await loadWeek(); setNotification({ type: 'success', message: 'Asignación eliminada' }) }
      else setNotification({ type: 'error', message: 'Error al eliminar' })
    } catch { setNotification({ type: 'error', message: 'Error de conexión' }) } finally {
      setActionLoading(null); setTimeout(() => setNotification(null), 4000)
    }
  }

  async function handleCompleteAssignment() {
    if (!confirmAction || confirmAction.type !== 'complete') return
    setActionLoading(confirmAction.assignment.id)
    try {
      const res = await api(`/api/assignments/${confirmAction.assignment.id}/complete`, { method: 'PATCH' })
      if (res.ok) { setConfirmAction(null); await loadWeek(); setNotification({ type: 'success', message: 'Asignación completada' }) }
      else setNotification({ type: 'error', message: 'Error al completar' })
    } catch { setNotification({ type: 'error', message: 'Error de conexión' }) } finally {
      setActionLoading(null); setTimeout(() => setNotification(null), 4000)
    }
  }

  async function handleFormSuccess() {
    setShowForm(false); setEditingAssignment(null)
    await loadWeek(); await loadProgram()
  }

  async function handleBulkGenerateReminders() {
    if (!week) return
    const pending = week.assignments.filter(a => a.status === 'DRAFT' && !isInformationalType(a.assignmentType))
    if (pending.length === 0) {
      setNotification({ type: 'error', message: 'No hay asignaciones pendientes para generar recordatorios' })
      setTimeout(() => setNotification(null), 4000); return
    }
    setGeneratingReminders(true)
    let totalCreated = 0; const errors: string[] = []
    for (const a of pending) {
      try {
        const res = await api(`/api/assignments/${a.id}/generate-reminders`, { method: 'POST' })
        if (res.ok) { const data = await res.json(); totalCreated += data.created || 0 }
        else errors.push(a.title)
      } catch { errors.push(a.title) }
    }
    if (errors.length > 0) setNotification({ type: 'error', message: `Error en: ${errors.join(', ')}` })
    else setNotification({ type: 'success', message: `${totalCreated} recordatorios creados` })
    setTimeout(() => setNotification(null), 4000)
    setGeneratingReminders(false); await loadWeek()
  }

  function openEditWeek() {
    if (!week) return
    setEditWeekForm({
      weekStartDate: week.weekStartDate.split('T')[0],
      meetingDate: week.meetingDate.split('T')[0],
      meetingTime: week.meetingTime,
      congregationName: week.congregationName || '',
      notes: week.notes || '',
    })
    setWeekError(''); setShowEditWeek(true)
  }

  async function handleEditWeekSubmit(e: React.FormEvent) {
    e.preventDefault(); setSavingWeek(true); setWeekError('')
    try {
      const body: Record<string, string> = {
        weekStartDate: `${editWeekForm.weekStartDate}T00:00:00.000Z`,
        meetingDate: `${editWeekForm.meetingDate}T00:00:00.000Z`,
        meetingTime: editWeekForm.meetingTime,
      }
      if (editWeekForm.congregationName) body.congregationName = editWeekForm.congregationName
      if (editWeekForm.notes) body.notes = editWeekForm.notes
      const res = await api(`/api/meeting-weeks/${weekId}`, { method: 'PUT', body: JSON.stringify(body) })
      if (res.ok) { setShowEditWeek(false); await loadWeek() }
      else { const data = await res.json(); setWeekError(data.error || 'Error al guardar') }
    } catch { setWeekError('Error de conexión') } finally { setSavingWeek(false) }
  }

  function toggleDescription(id: string) {
    setExpandedDescriptions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }


  // ─── Loading / Error ─────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-hairline rounded-pill" />
        <div className="h-32 bg-snow rounded-card" />
        <div className="h-96 bg-snow rounded-card" />
      </div>
    )
  }

  if (error || !week) {
    return (
      <div className="bg-snow rounded-card p-7 text-center py-16">
        <p className="text-graphite text-sm">{error || 'Semana no encontrada'}</p>
        <button onClick={() => router.push('/dashboard/semanas')} className="mt-4 text-azure text-sm font-medium hover:underline">
          Volver a semanas
        </button>
      </div>
    )
  }

  // ─── Computed ────────────────────────────────────────────

  const totalReminders = week.assignments.reduce((acc, a) => acc + (a.reminders?.length || 0), 0)
  const assignableAssignments = week.assignments.filter(a => !isInformationalType(a.assignmentType))
  const assignedCount = assignableAssignments.filter(a => a.assigned && a.status !== 'CANCELLED').length
  const totalAssignable = assignableAssignments.length
  const progressPercent = totalAssignable > 0 ? Math.round((assignedCount / totalAssignable) * 100) : 0
  const grouped = groupAssignmentsBySection(week.assignments)

  const cbsReaderPart = parts.find((p) => p.assignmentType === 'CONGREGATION_BIBLE_STUDY_READER')
  const hasCbsConductor = week.assignments.some((a) => a.assignmentType === 'CONGREGATION_BIBLE_STUDY_CONDUCTOR' && a.status !== 'CANCELLED') || parts.some((p) => p.assignmentType === 'CONGREGATION_BIBLE_STUDY_CONDUCTOR')
  const hasCbsReaderAssignment = week.assignments.some((a) => a.assignmentType === 'CONGREGATION_BIBLE_STUDY_READER' && a.status !== 'CANCELLED')
  const cbsReaderMissing = hasCbsConductor && !hasCbsReaderAssignment && !!cbsReaderPart

  const importMeta = programData ? importStatusMeta(programData.importStatus) : null


  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header compacto */}
      <div>
        <button
          onClick={() => router.push(week.monthlySchedule ? `/dashboard/programas/${week.monthlySchedule.id}` : '/dashboard/semanas')}
          className="inline-flex items-center gap-1.5 text-sm text-graphite hover:text-ink transition-colors mb-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          {week.monthlySchedule?.name || 'Semanas'}
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-heading font-semibold text-ink tracking-tight">Semana del {formatDate(week.weekStartDate)}</h1>
          {week.status && (
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-pill ${WEEK_STATUS_CLASS[week.status] || 'bg-fog text-graphite'}`}>
              {WEEK_STATUS_LABEL[week.status] || week.status}
            </span>
          )}
        </div>
        <p className="text-caption text-graphite mt-0.5">Programa de Vida y Ministerio · {monthName(week.weekStartDate)} {week.weekStartDate.split('T')[0].split('-')[0]}</p>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`px-4 py-2.5 rounded-card text-sm ${notification.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {notification.message}
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ═══ Main Column ═══ */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Meeting Summary */}
          <div className="bg-snow border border-hairline rounded-card px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="text-graphite">Reunión: <span className="text-ink font-medium">{formatDate(week.meetingDate)}</span></span>
              <span className="text-graphite">Hora: <span className="text-ink font-medium">{week.meetingTime}</span></span>
              <span className="text-graphite">Congregación: <span className="text-ink font-medium">{week.congregationName || 'Sin especificar'}</span></span>
              <span className="text-graphite">{totalAssignable} asignaciones · {totalReminders} recordatorios</span>
            </div>
          </div>

          {/* Import Status (compact) */}
          {importMeta && programData && (
            <div className="flex items-center justify-between gap-3 bg-snow border border-hairline rounded-card px-5 py-3">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${importMeta.dot === 'green' ? 'bg-grass' : importMeta.dot === 'yellow' ? 'bg-sun' : importMeta.dot === 'red' ? 'bg-ember' : 'bg-graphite'}`} />
                <span className="text-ink font-medium truncate">
                  {programData.importStatus === 'READY' ? 'Programa importado correctamente' : importMeta.label}
                </span>
                <span className="text-graphite">· {programData.itemCount} partes importadas desde WOL</span>
              </div>
              <button
                onClick={retryImport}
                disabled={retrying}
                className="text-xs text-azure hover:underline flex-shrink-0 disabled:opacity-50"
              >
                {retrying ? 'Importando...' : 'Reintentar'}
              </button>
            </div>
          )}

          {/* Assignment Progress */}
          <div className="bg-snow border border-hairline rounded-card px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink">Asignación de participantes</span>
              <span className="text-sm text-graphite">{assignedCount} de {totalAssignable}</span>
            </div>
            <div className="h-1.5 bg-hairline rounded-full overflow-hidden">
              <div className="h-full bg-azure rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="text-xs text-graphite mt-2">
              {assignedCount === totalAssignable
                ? 'Todas las partes tienen participante asignado.'
                : `Faltan ${totalAssignable - assignedCount} partes por asignar.`}
            </p>
          </div>

          {/* Mobile: Actions (visible only on mobile, before program) */}
          <div className="lg:hidden bg-snow border border-hairline rounded-card p-5 space-y-2.5">
            <button onClick={() => { setEditingAssignment(null); setFormInitialPartId(undefined); setShowForm(true) }} className="w-full bg-azure text-white text-sm font-medium px-4 py-2.5 rounded-pill hover:opacity-90 transition-opacity">
              Agregar asignación
            </button>
            <button onClick={openEditWeek} className="w-full text-sm font-medium text-ink px-4 py-2.5 rounded-pill border border-hairline hover:bg-stone transition-colors">
              Editar datos de la semana
            </button>
            <button onClick={handleBulkGenerateReminders} disabled={generatingReminders} className="w-full text-sm font-medium text-ink px-4 py-2.5 rounded-pill border border-hairline hover:bg-stone transition-colors disabled:opacity-50">
              {generatingReminders ? 'Generando...' : 'Generar recordatorios'}
            </button>
            <button onClick={() => setShowAllReminders(true)} className="w-full text-sm font-medium text-ink px-4 py-2.5 rounded-pill border border-hairline hover:bg-stone transition-colors">
              Ver recordatorios
            </button>
          </div>


          {/* CBS Reader Missing Alert */}
          {cbsReaderMissing && (
            <div className="flex items-center justify-between gap-3 rounded-card border border-amber-200 bg-amber-50 px-5 py-3">
              <div>
                <p className="text-sm font-medium text-amber-800">Falta asignar el lector del Estudio Bíblico</p>
                <p className="text-xs text-amber-700 mt-0.5">Esta parte necesita conductor y lector.</p>
              </div>
              <button
                onClick={() => { setEditingAssignment(null); setFormInitialPartId(cbsReaderPart!.id); setShowForm(true) }}
                className="shrink-0 text-sm font-medium text-azure hover:underline"
              >
                Asignar lector
              </button>
            </div>
          )}

          {/* ═══ Programa y asignaciones ═══ */}
          <div className="bg-snow border border-hairline rounded-card">
            <div className="px-5 py-4 border-b border-hairline">
              <h2 className="text-subheading font-semibold text-ink tracking-tight">Programa y asignaciones</h2>
            </div>

            {week.assignments.length === 0 ? (
              <div className="text-center py-12 px-5">
                <p className="text-graphite text-sm">No hay asignaciones en esta semana.</p>
                <p className="text-graphite/70 text-xs mt-1">Agrega la primera asignación para comenzar.</p>
              </div>
            ) : (
              <div className="divide-y divide-hairline">
                {grouped.map((group) => {
                  const groupAssignable = group.items.filter(a => !isInformationalType(a.assignmentType))
                  const groupAssigned = groupAssignable.filter(a => a.assigned && a.status !== 'CANCELLED').length
                  return (
                    <div key={group.section}>
                      {/* Section header */}
                      <div className="px-5 py-3 bg-stone/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink uppercase tracking-wide">{sectionLabel(group.section)}</span>
                          <span className="text-xs text-graphite">{groupAssignable.length} partes · {groupAssigned} asignadas</span>
                        </div>
                      </div>
                      {/* Assignment rows */}
                      <div className="divide-y divide-hairline/60">
                        {group.items.map((a) => {
                          if (isInformationalType(a.assignmentType)) {
                            return (
                              <div key={a.id} className="px-5 py-3 bg-stone/20">
                                <p className="text-sm text-graphite">{a.title}</p>
                              </div>
                            )
                          }
                          const sv = statusVariant(a.status)
                          const showDuration = a.durationMinutes && a.durationMinutes > 0 && !typeHasNoDuration(a.assignmentType)
                          const needsCompanion = typeNeedsCompanion(a.assignmentType)
                          const desc = programData?.items.find(p => p.title === a.title || (p.itemNumber === a.assignmentNumber && p.section === a.section))
                          const description = desc?.description || null
                          const reference = a.reference || desc?.reference || null
                          const lesson = desc?.lesson || null
                          const refText = [reference, lesson].filter(Boolean).join(' · ')
                          const isExpanded = expandedDescriptions.has(a.id)

                          return (
                            <div key={a.id} className="px-5 py-3 hover:bg-stone/30 transition-colors">
                              {/* Row: desktop */}
                              <div className="flex items-start gap-4">
                                {/* Left: info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-ink">{a.assignmentNumber}. {a.title}</p>
                                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-pill ${sv.classes}`}>{sv.label}</span>
                                  </div>
                                  {/* Meta line: duration + reference */}
                                  {(showDuration || refText) && (
                                    <p className="text-xs text-graphite mt-0.5">
                                      {showDuration && <span>{a.durationMinutes} min</span>}
                                      {showDuration && refText && <span> · </span>}
                                      {refText && <span>{refText}</span>}
                                    </p>
                                  )}
                                  {/* Description (collapsible) */}
                                  {description && (
                                    <div className="mt-1">
                                      <p className={`text-xs text-graphite ${!isExpanded ? 'line-clamp-1' : ''}`}>{description}</p>
                                      {description.length > 80 && (
                                        <button onClick={() => toggleDescription(a.id)} className="text-xs text-azure hover:underline mt-0.5">
                                          {isExpanded ? 'Ocultar' : 'Ver más'}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {/* Participants */}
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm">
                                    <span className="text-graphite">
                                      {a.assigned?.displayName || a.assigned?.fullName || <span className="text-amber-600 italic">Sin asignar</span>}
                                    </span>
                                    {needsCompanion && (
                                      <span className="text-graphite text-xs">
                                        Acomp: {a.companion?.displayName || a.companion?.fullName || '—'}
                                      </span>
                                    )}
                                    {a.room !== 'MAIN' && (
                                      <span className="text-xs text-graphite bg-stone px-1.5 py-0.5 rounded">{roomLabel(a.room)}</span>
                                    )}
                                  </div>
                                </div>
                                {/* Right: actions */}
                                <div className="flex-shrink-0 flex items-center gap-2">
                                  <button
                                    onClick={() => { setEditingAssignment(a); setFormInitialPartId(undefined); setShowForm(true) }}
                                    className="text-xs font-medium text-azure px-3 py-1.5 rounded-pill border border-azure/20 hover:bg-azure/5 transition-colors"
                                  >
                                    Editar
                                  </button>
                                  {a.status !== 'CANCELLED' && (
                                    <button
                                      onClick={() => setConfirmAction({ type: 'cancel', assignment: a })}
                                      className="text-xs font-medium text-red-600 px-3 py-1.5 rounded-pill border border-red-200 hover:bg-red-50 transition-colors"
                                    >
                                      Eliminar
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>


          {/* Recordatorios de esta semana (collapsible) */}
          <div className="bg-snow border border-hairline rounded-card">
            <button
              onClick={() => setShowRemindersSection(!showRemindersSection)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="text-sm font-semibold text-ink">Recordatorios de esta semana</span>
              <svg className={`w-4 h-4 text-graphite transition-transform ${showRemindersSection ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showRemindersSection && (
              <div className="px-5 pb-5 border-t border-hairline pt-4">
                {totalReminders === 0 ? (
                  <p className="text-sm text-graphite">Aún no hay recordatorios generados para esta semana.</p>
                ) : (
                  <WeekAutomations weekId={weekId} />
                )}
              </div>
            )}
          </div>

        </div>{/* end main column */}


        {/* ═══ Sidebar (desktop) ═══ */}
        <aside className="hidden lg:block w-72 flex-shrink-0">
          <div className="sticky top-6 space-y-4">
            {/* Status + Progress */}
            <div className="bg-snow border border-hairline rounded-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Estado</span>
                {week.status && (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-pill ${WEEK_STATUS_CLASS[week.status] || 'bg-fog text-graphite'}`}>
                    {WEEK_STATUS_LABEL[week.status] || week.status}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-graphite">Partes asignadas</span>
                  <span className="font-medium text-ink">{assignedCount}/{totalAssignable}</span>
                </div>
                <div className="h-1.5 bg-hairline rounded-full overflow-hidden">
                  <div className="h-full bg-azure rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
              <div className="text-xs text-graphite space-y-1">
                <p>{totalAssignable} asignaciones</p>
                <p>{totalReminders} recordatorios</p>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-snow border border-hairline rounded-card p-5 space-y-2.5">
              <p className="text-xs font-semibold text-graphite uppercase tracking-wide mb-1">Acciones</p>
              <button
                onClick={() => { setEditingAssignment(null); setFormInitialPartId(undefined); setShowForm(true) }}
                className="w-full bg-azure text-white text-sm font-medium px-4 py-2.5 rounded-pill hover:opacity-90 transition-opacity"
              >
                Agregar asignación
              </button>
              <button
                onClick={openEditWeek}
                className="w-full text-sm font-medium text-ink px-4 py-2.5 rounded-pill border border-hairline hover:bg-stone transition-colors"
              >
                Editar datos de la semana
              </button>
              <button
                onClick={handleBulkGenerateReminders}
                disabled={generatingReminders}
                className="w-full text-sm font-medium text-ink px-4 py-2.5 rounded-pill border border-hairline hover:bg-stone transition-colors disabled:opacity-50"
              >
                {generatingReminders ? 'Generando...' : 'Generar recordatorios'}
              </button>
              <button
                onClick={() => setShowAllReminders(true)}
                className="w-full text-sm font-medium text-ink px-4 py-2.5 rounded-pill border border-hairline hover:bg-stone transition-colors"
              >
                Ver recordatorios
              </button>
            </div>
          </div>
        </aside>

      </div>{/* end two-column layout */}


      {/* ═══ Modals ═══ */}

      {/* Assignment Form */}
      {showForm && (
        <AssignmentForm
          weekId={weekId}
          publishers={publishers}
          assignment={editingAssignment}
          parts={parts}
          existingNumbers={(week?.assignments || []).map((a) => a.assignmentNumber)}
          initialPartId={formInitialPartId}
          onClose={() => { setShowForm(false); setEditingAssignment(null); setFormInitialPartId(undefined) }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Reminders per assignment */}
      {viewingReminders && (
        <AssignmentReminders
          assignment={viewingReminders}
          onClose={() => setViewingReminders(null)}
        />
      )}

      {/* Confirm Action */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setConfirmAction(null)}>
          <div className="bg-snow rounded-card p-7 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${confirmAction.type === 'cancel' ? 'bg-red-50' : 'bg-emerald-50'}`}>
                {confirmAction.type === 'cancel' ? (
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                  <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                )}
              </div>
              <h2 className="text-lg font-semibold text-ink tracking-tight">
                {confirmAction.type === 'cancel' ? 'Eliminar asignación' : 'Completar asignación'}
              </h2>
            </div>
            <p className="text-sm text-graphite mb-2">
              {confirmAction.type === 'cancel'
                ? 'Esta acción eliminará la asignación y cancelará sus recordatorios. No se enviará ningún mensaje de esta parte al generar la automatización.'
                : 'Esta acción marcará la asignación como completada.'}
            </p>
            <p className="text-sm text-ink font-medium">{confirmAction.assignment.assignmentNumber}. {confirmAction.assignment.title}</p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={confirmAction.type === 'cancel' ? handleCancelAssignment : handleCompleteAssignment}
                disabled={actionLoading === confirmAction.assignment.id}
                className={`text-white text-sm font-medium px-5 py-2.5 rounded-pill disabled:opacity-50 ${confirmAction.type === 'cancel' ? 'bg-red-400 hover:opacity-90' : 'bg-emerald-500 hover:opacity-90'} transition-opacity`}
              >
                {actionLoading === confirmAction.assignment.id ? 'Procesando...' : confirmAction.type === 'cancel' ? 'Eliminar asignación' : 'Completar'}
              </button>
              <button onClick={() => setConfirmAction(null)} className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-hairline hover:bg-stone transition-colors">
                Volver
              </button>
            </div>
          </div>
        </div>
      )}


      {/* All Reminders Modal */}
      {showAllReminders && week && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowAllReminders(false)}>
          <div className="bg-snow rounded-card p-7 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-ink tracking-tight">Recordatorios de la semana</h2>
              <button onClick={() => setShowAllReminders(false)} className="p-2 rounded-xl hover:bg-stone transition-colors" aria-label="Cerrar">
                <svg className="w-5 h-5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {week.assignments.filter(a => a.reminders && a.reminders.length > 0).length === 0 ? (
              <p className="text-sm text-graphite text-center py-8">Aún no hay recordatorios generados para esta semana.</p>
            ) : (
              <div className="space-y-6">
                {week.assignments.filter(a => a.reminders && a.reminders.length > 0).map(a => (
                  <div key={a.id}>
                    <p className="text-sm font-medium text-ink mb-2">{a.assignmentNumber}. {a.title}</p>
                    <div className="space-y-2">
                      {a.reminders!.map(r => {
                        const rs = reminderStatusVariant(r.status)
                        return (
                          <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border border-hairline rounded-xl">
                            <div>
                              <p className="text-sm text-ink">{r.reminderDay}</p>
                              <p className="text-xs text-graphite">{r.publisher?.displayName || r.publisher?.fullName || 'Publicador'}</p>
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rs.classes}`}>{rs.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {/* Edit Week Modal */}
      {showEditWeek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowEditWeek(false)}>
          <div className="bg-snow rounded-card p-7 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">Editar datos de la semana</h2>
            {weekError && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{weekError}</p>}
            <form onSubmit={handleEditWeekSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Inicio de semana</label>
                <input type="date" required value={editWeekForm.weekStartDate} onChange={(e) => setEditWeekForm({ ...editWeekForm, weekStartDate: e.target.value })} className="w-full px-4 py-2.5 border border-hairline rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Fecha de reunión</label>
                <input type="date" required value={editWeekForm.meetingDate} onChange={(e) => setEditWeekForm({ ...editWeekForm, meetingDate: e.target.value })} className="w-full px-4 py-2.5 border border-hairline rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Hora de reunión</label>
                <input type="time" required value={editWeekForm.meetingTime} onChange={(e) => setEditWeekForm({ ...editWeekForm, meetingTime: e.target.value })} className="w-full px-4 py-2.5 border border-hairline rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Congregación</label>
                <input type="text" value={editWeekForm.congregationName} onChange={(e) => setEditWeekForm({ ...editWeekForm, congregationName: e.target.value })} className="w-full px-4 py-2.5 border border-hairline rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Notas</label>
                <textarea value={editWeekForm.notes} onChange={(e) => setEditWeekForm({ ...editWeekForm, notes: e.target.value })} rows={2} className="w-full px-4 py-2.5 border border-hairline rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={savingWeek} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
                  {savingWeek ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setShowEditWeek(false)} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-hairline hover:bg-stone transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
