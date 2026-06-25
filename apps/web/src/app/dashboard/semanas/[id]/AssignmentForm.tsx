'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface Publisher {
  id: string
  fullName: string
  displayName: string | null
  phone: string
  isActive: boolean
  canBeCompanion: boolean
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
  onClose: () => void
  onSuccess: () => void
}

const SECTIONS = [
  { value: 'BIBLE_READING', label: 'Lectura de la Biblia' },
  { value: 'APPLY_YOURSELF', label: 'Seamos mejores maestros' },
]

const TYPES = [
  { value: 'BIBLE_READING', label: 'Lectura de la Biblia' },
  { value: 'START_CONVERSATION', label: 'Empiece conversaciones' },
  { value: 'MAKE_RETURN_VISIT', label: 'Haga revisitas' },
  { value: 'BIBLE_STUDY', label: 'Haga discipulos (estudio)' },
  { value: 'EXPLAIN_BELIEFS', label: 'Explique sus creencias' },
  { value: 'MAKE_DISCIPLES', label: 'Haga discipulos' },
  { value: 'TALK', label: 'Discurso' },
  { value: 'OTHER', label: 'Otro' },
]

const ROOMS = [
  { value: 'MAIN', label: 'Principal' },
  { value: 'AUXILIARY', label: 'Auxiliar' },
]

// Assignments that don't require a companion
const NO_COMPANION_TYPES = ['BIBLE_READING', 'TALK']

function needsCompanion(section: string, type: string): boolean {
  if (section === 'BIBLE_READING') return false
  if (NO_COMPANION_TYPES.includes(type)) return false
  return true
}

const emptyForm = {
  assignmentNumber: '',
  section: 'APPLY_YOURSELF',
  assignmentType: 'START_CONVERSATION',
  title: '',
  durationMinutes: '',
  context: '',
  reference: '',
  assignedPublisherId: '',
  companionPublisherId: '',
  room: 'MAIN',
  notes: '',
}

export default function AssignmentForm({ weekId, publishers, assignment, onClose, onSuccess }: Props) {
  const isEditing = !!assignment
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (assignment) {
      setForm({
        assignmentNumber: String(assignment.assignmentNumber),
        section: assignment.section,
        assignmentType: assignment.assignmentType,
        title: assignment.title,
        durationMinutes: assignment.durationMinutes ? String(assignment.durationMinutes) : '',
        context: assignment.context || '',
        reference: assignment.reference || '',
        assignedPublisherId: assignment.assignedPublisherId,
        companionPublisherId: assignment.companionPublisherId || '',
        room: assignment.room,
        notes: assignment.notes || '',
      })
    }
  }, [assignment])

  function validate(): string | null {
    if (!form.assignmentNumber || isNaN(Number(form.assignmentNumber)) || Number(form.assignmentNumber) < 1) {
      return 'El numero de asignacion debe ser un numero positivo'
    }
    if (!form.title.trim()) return 'El titulo es obligatorio'
    if (!form.assignedPublisherId) return 'Debes seleccionar un asignado principal'
    if (form.durationMinutes && (isNaN(Number(form.durationMinutes)) || Number(form.durationMinutes) < 1)) {
      return 'La duracion debe ser un numero positivo'
    }
    if (form.assignedPublisherId && form.companionPublisherId && form.assignedPublisherId === form.companionPublisherId) {
      return 'El asignado y el acompanante no pueden ser la misma persona'
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
        assignmentNumber: Number(form.assignmentNumber),
        section: form.section,
        assignmentType: form.assignmentType,
        title: form.title.trim(),
        room: form.room,
        assignedPublisherId: form.assignedPublisherId,
      }
      if (form.durationMinutes) body.durationMinutes = Number(form.durationMinutes)
      if (form.context.trim()) body.context = form.context.trim()
      if (form.reference.trim()) body.reference = form.reference.trim()
      if (form.companionPublisherId) body.companionPublisherId = form.companionPublisherId
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

  // When section changes to BIBLE_READING, auto-set type
  function handleSectionChange(section: string) {
    if (section === 'BIBLE_READING') {
      setForm({ ...form, section, assignmentType: 'BIBLE_READING', companionPublisherId: '' })
    } else {
      setForm({ ...form, section, assignmentType: form.assignmentType === 'BIBLE_READING' ? 'START_CONVERSATION' : form.assignmentType })
    }
  }

  // When type changes to one that doesn't need companion, clear it
  function handleTypeChange(type: string) {
    if (NO_COMPANION_TYPES.includes(type)) {
      setForm({ ...form, assignmentType: type, companionPublisherId: '' })
    } else {
      setForm({ ...form, assignmentType: type })
    }
  }

  const showCompanion = needsCompanion(form.section, form.assignmentType)
  const companionPublishers = publishers.filter((p) => p.canBeCompanion && p.id !== form.assignedPublisherId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-card p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">
          {isEditing ? 'Editar asignacion' : 'Agregar asignacion'}
        </h2>

        {error && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{error}</p>}

        {isEditing && assignment?.status === 'SCHEDULED' && (
          <div className="text-sm text-amber-700 mb-4 p-3 bg-amber-50 rounded-xl">
            Esta asignacion ya tiene automatizaciones. Al guardar, se cancelaran los recordatorios pendientes y se
            generaran nuevos con un aviso de cambio. Los mensajes ya enviados se conservan.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row: Number + Section */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Numero</label>
              <input
                type="number"
                min={1}
                required
                value={form.assignmentNumber}
                onChange={(e) => setForm({ ...form, assignmentNumber: e.target.value })}
                className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                placeholder="3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Seccion</label>
              <select
                value={form.section}
                onChange={(e) => handleSectionChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
              >
                {SECTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Tipo de asignacion</label>
            <select
              value={form.assignmentType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
            >
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Titulo</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
              placeholder="Titulo de la asignacion"
            />
          </div>

          {/* Row: Duration + Room */}
          <div className="grid grid-cols-2 gap-4">
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

          {/* Context */}
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

          {/* Reference */}
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

          {/* Assigned Publisher */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Asignado principal</label>
            <select
              required
              value={form.assignedPublisherId}
              onChange={(e) => setForm({ ...form, assignedPublisherId: e.target.value })}
              className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
            >
              <option value="">Seleccionar publicador</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName || p.fullName}</option>
              ))}
            </select>
          </div>

          {/* Companion Publisher */}
          {showCompanion && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Acompanante (opcional)</label>
              <select
                value={form.companionPublisherId}
                onChange={(e) => setForm({ ...form, companionPublisherId: e.target.value })}
                className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
              >
                <option value="">Sin acompanante</option>
                {companionPublishers.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName || p.fullName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none"
              placeholder="Notas adicionales"
            />
          </div>

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
