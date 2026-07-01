'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Publisher {
  id: string
  fullName: string
  displayName: string | null
}

interface Reminder {
  id: string
  publisherId: string
  reminderDay: string
  scheduledAt: string
  sentAt: string | null
  status: string
  errorMessage: string | null
  publisher: Publisher
}

interface Assignment {
  id: string
  assignmentNumber: number
  title: string
  assignedPublisherId: string
  companionPublisherId: string | null
  assigned?: Publisher
  companion?: Publisher | null
}

interface Props {
  assignment: Assignment
  onClose: () => void
}

interface MessagePreview {
  primaryMessage: string | null
  assistantMessage: string | null
  reminderMessage: string | null
  warnings: string[]
}

const REMINDER_DAY_LABELS: Record<string, string> = {
  INITIAL_NOTICE: 'Aviso inicial',
  SEVEN_DAYS_BEFORE: '7 dias antes',
  THREE_DAYS_BEFORE: '3 dias antes',
  ONE_DAY_BEFORE: '1 dia antes',
  SAME_DAY: 'Mismo dia',
  CHANGE_NOTICE: 'Aviso de cambio',
  CANCELLATION_NOTICE: 'Aviso de cancelacion',
}

const STATUS_MAP: Record<string, { label: string; classes: string }> = {
  PENDING: { label: 'Pendiente', classes: 'bg-amber-50 text-amber-700' },
  QUEUED: { label: 'En cola', classes: 'bg-amber-50 text-amber-700' },
  SENDING: { label: 'Enviando', classes: 'bg-fog text-azure' },
  SENT: { label: 'Enviado', classes: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Error', classes: 'bg-red-50 text-red-700' },
  SKIPPED: { label: 'Omitido', classes: 'bg-fog text-graphite' },
  CANCELLED: { label: 'Cancelado', classes: 'bg-red-50 text-red-600' },
  DEAD: { label: 'Agotado', classes: 'bg-red-50 text-red-700' },
}

function formatDateTime(iso: string): string {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${months[m - 1]} ${y}`
}

export default function AssignmentReminders({ assignment, onClose }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<MessagePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await api(`/api/assignments/${assignment.id}`)
        if (res.ok) {
          const data = await res.json()
          setReminders(data.reminders || [])
        }
      } catch { /* ignore */ } finally {
        setLoading(false)
      }
    }
    async function loadPreview() {
      try {
        const res = await api(`/api/assignments/${assignment.id}/message-preview`)
        if (res.ok) setPreview(await res.json())
      } catch { /* ignore */ } finally {
        setPreviewLoading(false)
      }
    }
    load()
    loadPreview()
  }, [assignment.id])

  // Group reminders by publisher
  const assignedReminders = reminders.filter((r) => r.publisherId === assignment.assignedPublisherId)
  const companionReminders = assignment.companionPublisherId
    ? reminders.filter((r) => r.publisherId === assignment.companionPublisherId)
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-card p-7 w-full max-w-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-ink tracking-tight">Recordatorios</h2>
            <p className="text-sm text-graphite mt-0.5">{assignment.assignmentNumber}. {assignment.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-fog transition-colors" aria-label="Cerrar">
            <svg className="w-5 h-5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Vista previa de mensajes — mismo texto que se enviará por WhatsApp */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-ink mb-3">Vista previa de mensajes</h3>
          {previewLoading ? (
            <div className="h-24 bg-silver-mist/40 rounded-xl animate-pulse" />
          ) : !preview ? (
            <p className="text-xs text-graphite">No se pudo cargar la vista previa.</p>
          ) : (
            <div className="space-y-4">
              {preview.warnings.length > 0 && (
                <div className="bg-amber-50 rounded-xl px-4 py-2.5">
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">{w}</p>
                  ))}
                </div>
              )}
              {preview.primaryMessage && (
                <div>
                  <p className="text-xs font-medium text-graphite mb-1.5">Primer mensaje · Participante principal</p>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-ink bg-fog rounded-xl px-4 py-3">{preview.primaryMessage}</pre>
                </div>
              )}
              {preview.assistantMessage && (
                <div>
                  <p className="text-xs font-medium text-graphite mb-1.5">Primer mensaje · Acompañante</p>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-ink bg-fog rounded-xl px-4 py-3">{preview.assistantMessage}</pre>
                </div>
              )}
              {preview.reminderMessage && (
                <div>
                  <p className="text-xs font-medium text-graphite mb-1.5">Recordatorio corto</p>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-ink bg-fog rounded-xl px-4 py-3">{preview.reminderMessage}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        <h3 className="text-sm font-semibold text-ink mb-3">Recordatorios programados</h3>
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-silver-mist/50 rounded-xl" />)}
          </div>
        ) : reminders.length === 0 ? (
          <div className="text-center py-10">
            <svg className="w-10 h-10 text-graphite/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <p className="text-graphite text-sm">No hay recordatorios generados</p>
            <p className="text-graphite/70 text-xs mt-1">Usa la accion &ldquo;Generar&rdquo; para crear recordatorios</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Assigned Publisher Reminders */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-azure" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <h3 className="text-sm font-medium text-ink">
                  Asignado: {assignment.assigned?.displayName || assignment.assigned?.fullName || 'Publicador'}
                </h3>
              </div>
              {assignedReminders.length === 0 ? (
                <p className="text-xs text-graphite pl-6">Sin recordatorios</p>
              ) : (
                <div className="space-y-2">
                  {assignedReminders.map((r) => {
                    const st = STATUS_MAP[r.status] || STATUS_MAP.PENDING
                    return (
                      <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border border-silver-mist/70 rounded-xl">
                        <div>
                          <p className="text-sm text-ink">{REMINDER_DAY_LABELS[r.reminderDay] || r.reminderDay}</p>
                          <p className="text-xs text-graphite mt-0.5">Programado: {formatDateTime(r.scheduledAt)}</p>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${st.classes}`}>
                          {st.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Companion Reminders */}
            {assignment.companionPublisherId && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <h3 className="text-sm font-medium text-ink">
                    Acompanante: {assignment.companion?.displayName || assignment.companion?.fullName || 'Publicador'}
                  </h3>
                </div>
                {companionReminders.length === 0 ? (
                  <p className="text-xs text-graphite pl-6">Sin recordatorios</p>
                ) : (
                  <div className="space-y-2">
                    {companionReminders.map((r) => {
                      const st = STATUS_MAP[r.status] || STATUS_MAP.PENDING
                      return (
                        <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border border-silver-mist/70 rounded-xl">
                          <div>
                            <p className="text-sm text-ink">{REMINDER_DAY_LABELS[r.reminderDay] || r.reminderDay}</p>
                            <p className="text-xs text-graphite mt-0.5">Programado: {formatDateTime(r.scheduledAt)}</p>
                          </div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${st.classes}`}>
                            {st.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Close button */}
        <div className="mt-6 pt-4 border-t border-silver-mist">
          <button
            onClick={onClose}
            className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
