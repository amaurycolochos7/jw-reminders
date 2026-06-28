'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import {
  ASSIGNMENT_TYPE_OPTIONS,
  deriveSection,
  deriveTitle,
  deriveDurationMinutes,
  typeNeedsCompanion,
  isAssigneeGenderAllowed,
  isCompanionGenderAllowed,
  getAssignmentTypeRule,
  type GenderValue,
} from '@/lib/assignment-rules'

interface Publisher {
  id: string
  fullName: string
  displayName: string | null
  phone: string
  isActive: boolean
  canBeCompanion: boolean
  gender: string | null
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
}

interface Props {
  weekId: string
  publishers: Publisher[]
  assignment: Assignment | null
  /** Numbers already used in the week, to auto-assign the next one. */
  existingNumbers?: number[]
  onClose: () => void
  onSuccess: () => void
}

const ROOMS = [
  { value: 'MAIN', label: 'Principal' },
  { value: 'AUXILIARY', label: 'Auxiliar' },
]

function nextNumber(existing: number[]): number {
  return existing.length ? Math.max(...existing) + 1 : 1
}

export default function AssignmentForm({ weekId, publishers, assignment, existingNumbers = [], onClose, onSuccess }: Props) {
  const isEditing = !!assignment

  const [form, setForm] = useState({
    assignmentNumber: String(nextNumber(existingNumbers)),
    assignmentType: 'START_CONVERSATION',
    title: deriveTitle('START_CONVERSATION'),
    durationMinutes: String(deriveDurationMinutes('START_CONVERSATION')),
    context: '',
    reference: '',
    assignedPublisherId: '',
    companionPublisherId: '',
    room: 'MAIN',
    notes: '',
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (assignment) {
      setForm({
        assignmentNumber: String(assignment.assignmentNumber),
        assignmentType: assignment.assignmentType,
        title: assignment.title,
        durationMinutes: assignment.durationMinutes ? String(assignment.durationMinutes) : String(deriveDurationMinutes(assignment.assignmentType)),
        context: assignment.context || '',
        reference: assignment.reference || '',
        assignedPublisherId: assignment.assignedPublisherId,
        companionPublisherId: assignment.companionPublisherId || '',
        room: assignment.room,
        notes: assignment.notes || '',
      })
    }
  }, [assignment])

  const showCompanion = typeNeedsCompanion(form.assignmentType)
  const rule = getAssignmentTypeRule(form.assignmentType)

  // Eligible assignees by gender rule for the selected part.
  const assignedOptions = publishers.filter((p) => isAssigneeGenderAllowed(form.assignmentType, p.gender as GenderValue | null))

  // Eligible companions: can be companion, not the assignee, and same gender when required.
  const assignedGender = (publishers.find((p) => p.id === form.assignedPublisherId)?.gender ?? null) as GenderValue | null
  const companionOptions = publishers.filter(
    (p) =>
      p.canBeCompanion &&
      p.id !== form.assignedPublisherId &&
      isCompanionGenderAllowed(form.assignmentType, assignedGender, p.gender as GenderValue | null),
  )

  // When the part (type) changes, derive section/title/duration and reset incompatible fields.
  function handleTypeChange(type: string) {
    setForm((prev) => {
      const next = {
        ...prev,
        assignmentType: type,
        title: deriveTitle(type),
        durationMinutes: String(deriveDurationMinutes(type)),
      }
      // Clear companion if no longer needed.
      if (!typeNeedsCompanion(type)) next.companionPublisherId = ''
      // Clear assignee if its gender is no longer allowed.
      if (prev.assignedPublisherId) {
        const g = (publishers.find((p) => p.id === prev.assignedPublisherId)?.gender ?? null) as GenderValue | null
        if (!isAssigneeGenderAllowed(type, g)) {
          next.assignedPublisherId = ''
          next.companionPublisherId = ''
        }
      }
      return next
    })
  }

  function handleAssignedChange(id: string) {
    setForm((prev) => {
      const next = { ...prev, assignedPublisherId: id }
      // Clear companion if it no longer satisfies the same-gender rule.
      if (next.companionPublisherId) {
        const ag = (publishers.find((p) => p.id === id)?.gender ?? null) as GenderValue | null
        const cg = (publishers.find((p) => p.id === next.companionPublisherId)?.gender ?? null) as GenderValue | null
        if (!isCompanionGenderAllowed(prev.assignmentType, ag, cg) || id === next.companionPublisherId) {
          next.companionPublisherId = ''
        }
      }
      return next
    })
  }

  function validate(): string | null {
    if (!form.title.trim()) return 'El titulo es obligatorio'
    if (!form.assignedPublisherId) return 'Debes seleccionar una persona'
    if (form.durationMinutes && (isNaN(Number(form.durationMinutes)) || Number(form.durationMinutes) < 1)) {
      return 'La duracion debe ser un numero positivo'
    }
    if (form.assignedPublisherId && form.companionPublisherId && form.assignedPublisherId === form.companionPublisherId) {
      return 'La persona y el acompanante no pueden ser la misma'
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const body: any = {
        meetingWeekId: weekId,
        assignmentNumber: Number(form.assignmentNumber) || nextNumber(existingNumbers),
        section: deriveSection(form.assignmentType),
        assignmentType: form.assignmentType,
        title: form.title.trim(),
        room: form.room,
        assignedPublisherId: form.assignedPublisherId,
      }
      if (form.durationMinutes) body.durationMinutes = Number(form.durationMinutes)
      if (form.context.trim()) body.context = form.context.trim()
      if (form.reference.trim()) body.reference = form.reference.trim()
      if (showCompanion && form.companionPublisherId) body.companionPublisherId = form.companionPublisherId
      if (form.notes.trim()) body.notes = form.notes.trim()

      const url = isEditing ? `/api/assignments/${assignment!.id}` : '/api/assignments'
      const method = isEditing ? 'PUT' : 'POST'
      const res = await api(url, { method, body: JSON.stringify(body) })

      if (res.ok) {
        onSuccess()
      } else {
        const data = await res.json()
        setError(data.error || 'Error al guardar')
      }
    } catch {
      setError('Error de conexion')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-card p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-ink tracking-tight mb-1">
          {isEditing ? 'Editar asignacion' : 'Agregar asignacion'}
        </h2>
        <p className="text-sm text-graphite mb-5">El sistema aplica las reglas solo: secciones, titulos y quien puede recibir cada parte.</p>

        {error && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{error}</p>}

        {isEditing && assignment?.status === 'SCHEDULED' && (
          <div className="text-sm text-amber-700 mb-4 p-3 bg-amber-50 rounded-xl">
            Esta asignacion ya tiene automatizaciones. Al guardar, se cancelaran los recordatorios pendientes y se
            generaran nuevos con un aviso de cambio. Los mensajes ya enviados se conservan.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Parte (tipo) — define seccion, titulo y reglas */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Parte</label>
            <select
              value={form.assignmentType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
            >
              {ASSIGNMENT_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {rule.allowedAssigneeGenders.length > 0 && (
              <p className="text-xs text-graphite mt-1.5">Esta parte solo puede asignarse a hombres.</p>
            )}
          </div>

          {/* Persona */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Persona</label>
            <select
              required
              value={form.assignedPublisherId}
              onChange={(e) => handleAssignedChange(e.target.value)}
              className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
            >
              <option value="">Seleccionar persona</option>
              {assignedOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName || p.fullName}</option>
              ))}
            </select>
          </div>

          {/* Acompanante (solo si la parte lo requiere) */}
          {showCompanion && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Acompanante</label>
              <select
                value={form.companionPublisherId}
                onChange={(e) => setForm({ ...form, companionPublisherId: e.target.value })}
                className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
              >
                <option value="">Sin acompanante</option>
                {companionOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName || p.fullName}</option>
                ))}
              </select>
              {rule.companionSameGender && (
                <p className="text-xs text-graphite mt-1.5">El acompanante debe ser del mismo sexo que la persona asignada.</p>
              )}
            </div>
          )}

          {/* Duracion */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Duracion (min)</label>
            <input
              type="number"
              min={1}
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
              className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
              placeholder="5"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none"
              placeholder="Notas adicionales (opcional)"
            />
          </div>

          {/* Opciones avanzadas */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-sm text-azure font-medium hover:opacity-80 transition-opacity"
            >
              {showAdvanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas'}
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 border-t border-silver-mist pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Numero</label>
                  <input
                    type="number"
                    min={1}
                    value={form.assignmentNumber}
                    onChange={(e) => setForm({ ...form, assignmentNumber: e.target.value })}
                    className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Sala</label>
                  <select
                    value={form.room}
                    onChange={(e) => setForm({ ...form, room: e.target.value })}
                    className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
                  >
                    {ROOMS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Titulo personalizado</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  placeholder="Titulo de la asignacion"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Referencia</label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  placeholder="Ej: Salmo 23:1-6"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Contexto</label>
                <input
                  type="text"
                  value={form.context}
                  onChange={(e) => setForm({ ...form, context: e.target.value })}
                  className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  placeholder="Contexto de la asignacion"
                />
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear asignacion'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
