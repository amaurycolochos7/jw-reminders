'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import AssignmentForm from './AssignmentForm'
import AssignmentReminders from './AssignmentReminders'
import WeekAutomations from './WeekAutomations'
import WeekProgram from './WeekProgram'

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

// ─── Helpers ─────────────────────────────────────────────

function formatDate(iso: string): string {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${months[m - 1]} ${y}`
}

function sectionLabel(section: string): string {
  const map: Record<string, string> = {
    BIBLE_READING: 'Lectura de la Biblia',
    APPLY_YOURSELF: 'Seamos mejores maestros',
  }
  return map[section] || section
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    BIBLE_READING: 'Lectura de la Biblia',
    START_CONVERSATION: 'Empiece conversaciones',
    MAKE_RETURN_VISIT: 'Haga revisitas',
    BIBLE_STUDY: 'Haga discipulos',
    EXPLAIN_BELIEFS: 'Explique sus creencias',
    MAKE_DISCIPLES: 'Haga discipulos',
    TALK: 'Discurso',
    OTHER: 'Otro',
  }
  return map[type] || type
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

function canGenerate(status: string) {
  return status === 'DRAFT'
}

function canClose(status: string) {
  return status === 'DRAFT' || status === 'SCHEDULED'
}

// ─── Page ────────────────────────────────────────────────

export default function SemanaDetallePage() {
  const params = useParams()
  const router = useRouter()
  const weekId = params.id as string

  const [week, setWeek] = useState<MeetingWeek | null>(null)
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)

  // Reminders view
  const [viewingReminders, setViewingReminders] = useState<Assignment | null>(null)

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'cancel' | 'complete' | 'delete'; assignment: Assignment } | null>(null)

  // Edit week state
  const [showEditWeek, setShowEditWeek] = useState(false)
  const [editWeekForm, setEditWeekForm] = useState({ weekStartDate: '', meetingDate: '', meetingTime: '', congregationName: '', notes: '' })
  const [savingWeek, setSavingWeek] = useState(false)
  const [weekError, setWeekError] = useState('')

  // Bulk reminders & notifications
  const [generatingReminders, setGeneratingReminders] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showAllReminders, setShowAllReminders] = useState(false)

  const loadWeek = useCallback(async () => {
    try {
      const res = await api(`/api/meeting-weeks/${weekId}`)
      if (res.ok) {
        setWeek(await res.json())
      } else {
        setError('No se pudo cargar la semana')
      }
    } catch {
      setError('Error de conexion')
    } finally {
      setLoading(false)
    }
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

  useEffect(() => {
    loadWeek()
    loadPublishers()
  }, [loadWeek, loadPublishers])

  // ─── Assignment Actions ──────────────────────────────────

  async function handleGenerateReminders(assignmentId: string) {
    setActionLoading(assignmentId)
    try {
      const res = await api(`/api/assignments/${assignmentId}/generate-reminders`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setNotification({ type: 'success', message: data.created > 0 ? `${data.created} recordatorios creados` : 'Esta asignacion ya tiene automatizaciones activas' })
        await loadWeek()
      } else {
        const data = await res.json()
        setNotification({ type: 'error', message: data.error || 'Error al generar recordatorios' })
      }
    } catch {
      setNotification({ type: 'error', message: 'Error de conexion' })
    } finally {
      setActionLoading(null)
      setTimeout(() => setNotification(null), 4000)
    }
  }

  async function handleCancelAssignment() {
    if (!confirmAction || confirmAction.type !== 'cancel') return
    setActionLoading(confirmAction.assignment.id)
    try {
      const res = await api(`/api/assignments/${confirmAction.assignment.id}/cancel`, { method: 'PATCH' })
      if (res.ok) {
        setConfirmAction(null)
        await loadWeek()
        setNotification({ type: 'success', message: 'Asignacion cancelada' })
      } else {
        setNotification({ type: 'error', message: 'Error al cancelar' })
      }
    } catch {
      setNotification({ type: 'error', message: 'Error de conexion' })
    } finally {
      setActionLoading(null)
      setTimeout(() => setNotification(null), 4000)
    }
  }

  async function handleCompleteAssignment() {
    if (!confirmAction || confirmAction.type !== 'complete') return
    setActionLoading(confirmAction.assignment.id)
    try {
      const res = await api(`/api/assignments/${confirmAction.assignment.id}/complete`, { method: 'PATCH' })
      if (res.ok) {
        setConfirmAction(null)
        await loadWeek()
        setNotification({ type: 'success', message: 'Asignacion completada' })
      } else {
        setNotification({ type: 'error', message: 'Error al completar' })
      }
    } catch {
      setNotification({ type: 'error', message: 'Error de conexion' })
    } finally {
      setActionLoading(null)
      setTimeout(() => setNotification(null), 4000)
    }
  }

  async function handleFormSuccess() {
    setShowForm(false)
    setEditingAssignment(null)
    await loadWeek()
  }

  // ─── Bulk Generate Reminders ───────────────────────────────

  async function handleBulkGenerateReminders() {
    if (!week) return
    const pendingAssignments = week.assignments.filter(a => a.status === 'DRAFT')
    if (pendingAssignments.length === 0) {
      setNotification({ type: 'error', message: 'No hay asignaciones pendientes para generar recordatorios' })
      setTimeout(() => setNotification(null), 4000)
      return
    }
    setGeneratingReminders(true)
    let totalCreated = 0
    const errors: string[] = []
    for (const a of pendingAssignments) {
      try {
        const res = await api(`/api/assignments/${a.id}/generate-reminders`, { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          totalCreated += data.created || 0
        } else {
          errors.push(a.title)
        }
      } catch {
        errors.push(a.title)
      }
    }
    if (errors.length > 0) {
      setNotification({ type: 'error', message: `Error en: ${errors.join(', ')}` })
    } else {
      setNotification({ type: 'success', message: `${totalCreated} recordatorios creados` })
    }
    setTimeout(() => setNotification(null), 4000)
    setGeneratingReminders(false)
    await loadWeek()
  }

  // ─── Edit Week ─────────────────────────────────────────────

  function openEditWeek() {
    if (!week) return
    setEditWeekForm({
      weekStartDate: week.weekStartDate.split('T')[0],
      meetingDate: week.meetingDate.split('T')[0],
      meetingTime: week.meetingTime,
      congregationName: week.congregationName || '',
      notes: week.notes || '',
    })
    setWeekError('')
    setShowEditWeek(true)
  }

  async function handleEditWeekSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSavingWeek(true)
    setWeekError('')
    try {
      const body: any = {
        weekStartDate: `${editWeekForm.weekStartDate}T00:00:00.000Z`,
        meetingDate: `${editWeekForm.meetingDate}T00:00:00.000Z`,
        meetingTime: editWeekForm.meetingTime,
      }
      if (editWeekForm.congregationName) body.congregationName = editWeekForm.congregationName
      if (editWeekForm.notes) body.notes = editWeekForm.notes
      const res = await api(`/api/meeting-weeks/${weekId}`, { method: 'PUT', body: JSON.stringify(body) })
      if (res.ok) {
        setShowEditWeek(false)
        await loadWeek()
      } else {
        const data = await res.json()
        setWeekError(data.error || 'Error al guardar')
      }
    } catch { setWeekError('Error de conexion') } finally { setSavingWeek(false) }
  }

  // ─── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-silver-mist rounded-pill" />
        <div className="h-48 bg-white rounded-card" />
        <div className="h-96 bg-white rounded-card" />
      </div>
    )
  }

  if (error || !week) {
    return (
      <div className="bg-white rounded-card p-7 text-center py-16">
        <p className="text-graphite text-sm">{error || 'Semana no encontrada'}</p>
        <button onClick={() => router.push('/dashboard/semanas')} className="mt-4 text-azure text-sm font-medium hover:underline">
          Volver a semanas
        </button>
      </div>
    )
  }

  const totalReminders = week.assignments.reduce((acc, a) => acc + (a.reminders?.length || 0), 0)
  const WEEK_STATUS_LABEL: Record<string, string> = { DRAFT: 'Borrador', READY: 'Lista', ACTIVE: 'Activa', COMPLETED: 'Completada', ARCHIVED: 'Archivada', CANCELLED: 'Cancelada' }
  const WEEK_STATUS_CLASS: Record<string, string> = { DRAFT: 'bg-amber-50 text-amber-700', READY: 'bg-fog text-azure', ACTIVE: 'bg-emerald-50 text-emerald-700', COMPLETED: 'bg-fog text-graphite', ARCHIVED: 'bg-fog text-graphite', CANCELLED: 'bg-red-50 text-red-700' }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/semanas')} className="p-2 rounded-xl hover:bg-fog transition-colors" aria-label="Volver">
          <svg className="w-5 h-5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-semibold text-ink tracking-tight">Semana del {formatDate(week.weekStartDate)}</h1>
            {week.status && (
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-pill ${WEEK_STATUS_CLASS[week.status] || 'bg-fog text-graphite'}`}>
                {WEEK_STATUS_LABEL[week.status] || week.status}
              </span>
            )}
          </div>
          <p className="text-sm text-graphite mt-0.5">{week.monthlySchedule?.name || 'Sin programa'} / Detalle y asignaciones</p>
        </div>
      </div>

      {/* Week Info Card */}
      <div className="bg-white rounded-card p-7">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-xs font-medium text-graphite uppercase tracking-wide">Fecha de reunion</p>
            <p className="text-sm text-ink mt-1 font-medium">{formatDate(week.meetingDate)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-graphite uppercase tracking-wide">Hora</p>
            <p className="text-sm text-ink mt-1 font-medium">{week.meetingTime}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-graphite uppercase tracking-wide">Congregacion</p>
            <p className="text-sm text-ink mt-1 font-medium">{week.congregationName || 'Sin especificar'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-graphite uppercase tracking-wide">Asignaciones / Recordatorios</p>
            <p className="text-sm text-ink mt-1 font-medium">{week.assignments.length} asignaciones / {totalReminders} recordatorios</p>
          </div>
        </div>
        {week.notes && (
          <div className="mt-4 pt-4 border-t border-silver-mist">
            <p className="text-xs font-medium text-graphite uppercase tracking-wide">Notas</p>
            <p className="text-sm text-graphite mt-1">{week.notes}</p>
          </div>
        )}
      </div>

      {/* WOL program (import status, source, items, retry, manual capture) */}
      <WeekProgram weekId={weekId} onChanged={loadWeek} />

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <button
          onClick={() => { setEditingAssignment(null); setShowForm(true) }}
          className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity"
        >
          Agregar asignacion
        </button>
        <button
          onClick={handleBulkGenerateReminders}
          disabled={generatingReminders}
          className="text-sm font-medium text-ink px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors disabled:opacity-50"
        >
          {generatingReminders ? 'Generando...' : 'Generar recordatorios'}
        </button>
        <button
          onClick={() => setShowAllReminders(true)}
          className="text-sm font-medium text-ink px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors"
        >
          Ver recordatorios
        </button>
        <button
          onClick={openEditWeek}
          className="text-sm font-medium text-ink px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors"
        >
          Editar semana
        </button>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`p-3 rounded-xl text-sm ${notification.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {notification.message}
        </div>
      )}

      {/* Assignments Section */}
      <div className="bg-white rounded-card p-7">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-ink tracking-tight">Asignaciones</h2>
        </div>

        {week.assignments.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-10 h-10 text-graphite/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
            <p className="text-graphite text-sm">No hay asignaciones en esta semana</p>
            <p className="text-graphite/70 text-xs mt-1">Agrega la primera asignacion para comenzar</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-silver-mist">
                    <th className="text-left py-3 px-2 text-xs font-medium text-graphite uppercase tracking-wide">No.</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-graphite uppercase tracking-wide">Seccion</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-graphite uppercase tracking-wide">Tipo</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-graphite uppercase tracking-wide">Titulo</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-graphite uppercase tracking-wide">Participante principal</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-graphite uppercase tracking-wide">Acompañante</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-graphite uppercase tracking-wide">Sala</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-graphite uppercase tracking-wide">Estado</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-graphite uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {week.assignments.map((a) => {
                    const sv = statusVariant(a.status)
                    return (
                      <tr key={a.id} className="border-b border-silver-mist/50 last:border-0">
                        <td className="py-3 px-2 font-medium text-ink">{a.assignmentNumber}</td>
                        <td className="py-3 px-2 text-graphite">{sectionLabel(a.section)}</td>
                        <td className="py-3 px-2 text-graphite">{typeLabel(a.assignmentType)}</td>
                        <td className="py-3 px-2 text-ink font-medium">{a.title}</td>
                        <td className="py-3 px-2 text-ink">{a.assigned?.displayName || a.assigned?.fullName || '---'}</td>
                        <td className="py-3 px-2 text-graphite">{a.companion?.displayName || a.companion?.fullName || '---'}</td>
                        <td className="py-3 px-2 text-graphite">{roomLabel(a.room)}</td>
                        <td className="py-3 px-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sv.classes}`}>{sv.label}</span>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingAssignment(a); setShowForm(true) }}
                              className="text-azure text-xs font-medium px-2 py-1 rounded-lg hover:bg-azure/5 transition-colors"
                              title="Editar"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => setViewingReminders(a)}
                              className="text-graphite text-xs font-medium px-2 py-1 rounded-lg hover:bg-fog transition-colors"
                              title="Recordatorios"
                            >
                              Recordatorios
                            </button>
                            {canGenerate(a.status) && (
                              <>
                                <button
                                  onClick={() => handleGenerateReminders(a.id)}
                                  disabled={actionLoading === a.id}
                                  className="text-emerald-700 text-xs font-medium px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
                                  title="Generar recordatorios"
                                >
                                  Generar
                                </button>
                              </>
                            )}
                            {canClose(a.status) && (
                              <>
                                <button
                                  onClick={() => setConfirmAction({ type: 'complete', assignment: a })}
                                  className="text-graphite text-xs font-medium px-2 py-1 rounded-lg hover:bg-fog transition-colors"
                                >
                                  Completar
                                </button>
                                <button
                                  onClick={() => setConfirmAction({ type: 'cancel', assignment: a })}
                                  className="text-red-600 text-xs font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                  Cancelar
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {week.assignments.map((a) => {
                const sv = statusVariant(a.status)
                return (
                  <div key={a.id} className="border border-silver-mist rounded-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-ink">{a.assignmentNumber}. {a.title}</p>
                        <p className="text-xs text-graphite mt-0.5">{sectionLabel(a.section)} / {typeLabel(a.assignmentType)}</p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sv.classes}`}>{sv.label}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-graphite">Participante principal:</span>
                        <span className="text-ink ml-1">{a.assigned?.displayName || a.assigned?.fullName || '---'}</span>
                      </div>
                      <div>
                        <span className="text-graphite">Acompañante:</span>
                        <span className="text-ink ml-1">{a.companion?.displayName || a.companion?.fullName || '---'}</span>
                      </div>
                      <div>
                        <span className="text-graphite">Sala:</span>
                        <span className="text-ink ml-1">{roomLabel(a.room)}</span>
                      </div>
                      {a.durationMinutes && (
                        <div>
                          <span className="text-graphite">Duracion:</span>
                          <span className="text-ink ml-1">{a.durationMinutes} min</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-silver-mist/50">
                      <button onClick={() => { setEditingAssignment(a); setShowForm(true) }} className="text-azure text-xs font-medium px-2 py-1 rounded-lg hover:bg-azure/5 transition-colors">Editar</button>
                      <button onClick={() => setViewingReminders(a)} className="text-graphite text-xs font-medium px-2 py-1 rounded-lg hover:bg-fog transition-colors">Recordatorios</button>
                      {canGenerate(a.status) && (
                        <>
                          <button onClick={() => handleGenerateReminders(a.id)} disabled={actionLoading === a.id} className="text-emerald-700 text-xs font-medium px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50">Generar</button>
                        </>
                      )}
                      {canClose(a.status) && (
                        <>
                          <button onClick={() => setConfirmAction({ type: 'complete', assignment: a })} className="text-graphite text-xs font-medium px-2 py-1 rounded-lg hover:bg-fog transition-colors">Completar</button>
                          <button onClick={() => setConfirmAction({ type: 'cancel', assignment: a })} className="text-red-600 text-xs font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">Cancelar</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {week && <div className="mt-6"><WeekAutomations weekId={weekId} /></div>}
      </div>

      {/* Assignment Form Modal */}
      {showForm && (
        <AssignmentForm
          weekId={weekId}
          publishers={publishers}
          assignment={editingAssignment}
          existingNumbers={(week?.assignments || []).map((a) => a.assignmentNumber)}
          onClose={() => { setShowForm(false); setEditingAssignment(null) }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Reminders Modal */}
      {viewingReminders && (
        <AssignmentReminders
          assignment={viewingReminders}
          onClose={() => setViewingReminders(null)}
        />
      )}

      {/* Confirm Action Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setConfirmAction(null)}>
          <div className="bg-white rounded-card p-7 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${confirmAction.type === 'cancel' ? 'bg-red-50' : 'bg-emerald-50'}`}>
                {confirmAction.type === 'cancel' ? (
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <h2 className="text-lg font-semibold text-ink tracking-tight">
                {confirmAction.type === 'cancel' ? 'Cancelar asignacion' : 'Completar asignacion'}
              </h2>
            </div>
            <p className="text-sm text-graphite mb-2">
              {confirmAction.type === 'cancel'
                ? 'Esta accion cancelara la asignacion y todos los recordatorios pendientes.'
                : 'Esta accion marcara la asignacion como completada y cancelara recordatorios pendientes.'}
            </p>
            <p className="text-sm text-ink font-medium">
              {confirmAction.assignment.assignmentNumber}. {confirmAction.assignment.title}
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={confirmAction.type === 'cancel' ? handleCancelAssignment : handleCompleteAssignment}
                disabled={actionLoading === confirmAction.assignment.id}
                className={`text-white text-sm font-medium px-5 py-2.5 rounded-pill disabled:opacity-50 ${confirmAction.type === 'cancel' ? 'bg-red-400 hover:opacity-90' : 'bg-emerald-500 hover:opacity-90'} transition-opacity`}
              >
                {actionLoading === confirmAction.assignment.id ? 'Procesando...' : confirmAction.type === 'cancel' ? 'Cancelar asignacion' : 'Completar'}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ver recordatorios (all week) Modal */}
      {showAllReminders && week && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowAllReminders(false)}>
          <div className="bg-white rounded-card p-7 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-ink tracking-tight">Recordatorios de la semana</h2>
              <button onClick={() => setShowAllReminders(false)} className="p-2 rounded-xl hover:bg-fog transition-colors" aria-label="Cerrar">
                <svg className="w-5 h-5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {week.assignments.filter(a => a.reminders && a.reminders.length > 0).length === 0 ? (
              <p className="text-sm text-graphite text-center py-8">No hay recordatorios generados en esta semana</p>
            ) : (
              <div className="space-y-6">
                {week.assignments.filter(a => a.reminders && a.reminders.length > 0).map(a => (
                  <div key={a.id}>
                    <p className="text-sm font-medium text-ink mb-2">{a.assignmentNumber}. {a.title}</p>
                    <div className="space-y-2">
                      {a.reminders!.map(r => {
                        const rs = reminderStatusVariant(r.status)
                        return (
                          <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border border-silver-mist/70 rounded-xl">
                            <div>
                              <p className="text-sm text-ink">{r.reminderDay}</p>
                              <p className="text-xs text-graphite">{r.publisher?.displayName || r.publisher?.fullName || 'Publicador'}</p>
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rs.classes}`}>
                              {rs.label}
                            </span>
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

      {/* Editar semana Modal */}
      {showEditWeek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowEditWeek(false)}>
          <div className="bg-white rounded-card p-7 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">Editar semana</h2>
            {weekError && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{weekError}</p>}
            <form onSubmit={handleEditWeekSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Inicio de semana</label>
                <input type="date" required value={editWeekForm.weekStartDate} onChange={(e) => setEditWeekForm({ ...editWeekForm, weekStartDate: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Fecha de reunion</label>
                <input type="date" required value={editWeekForm.meetingDate} onChange={(e) => setEditWeekForm({ ...editWeekForm, meetingDate: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Hora de reunion</label>
                <input type="time" required value={editWeekForm.meetingTime} onChange={(e) => setEditWeekForm({ ...editWeekForm, meetingTime: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Congregacion</label>
                <input type="text" value={editWeekForm.congregationName} onChange={(e) => setEditWeekForm({ ...editWeekForm, congregationName: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Notas</label>
                <textarea value={editWeekForm.notes} onChange={(e) => setEditWeekForm({ ...editWeekForm, notes: e.target.value })} rows={2} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={savingWeek} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
                  {savingWeek ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setShowEditWeek(false)} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
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
