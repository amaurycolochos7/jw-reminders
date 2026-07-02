'use client'

import { useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { SearchableSelect } from '@/components/SearchableSelect'
import {
  ASSIGNMENT_TYPE_OPTIONS,
  deriveSection,
  deriveTitle,
  deriveDurationMinutes,
  typeNeedsCompanion,
  isAssigneeGenderAllowed,
  isCompanionGenderAllowed,
  isPublisherEligibleForAssignment,
  getAssignmentTypeRule,
  typeHasNoDuration,
  type GenderValue,
} from '@/lib/assignment-rules'

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
  programItemId?: string | null
}

/** Parte real de la semana (MeetingProgramItem) enriquecida con su asignación. */
export interface WeekPart {
  id: string
  itemNumber: number | null
  sortOrder: number
  section: string
  title: string
  assignmentType: string
  durationMinutes: number | null
  requiresAssignee: boolean
  needsCompanion: boolean
  assignment: {
    id: string
    status: string
    assignedPublisherId: string
    assignedName: string | null
  } | null
}

interface Props {
  weekId: string
  publishers: Publisher[]
  assignment: Assignment | null
  /** Partes reales de la semana (para el selector). Si falta, se usa flujo manual. */
  parts?: WeekPart[]
  existingNumbers?: number[]
  onClose: () => void
  onSuccess: () => void
}

const ROOMS = [
  { value: 'MAIN', label: 'Principal' },
  { value: 'AUXILIARY', label: 'Auxiliar' },
]

// Orden y etiquetas de secciones (igual que la vista de semana).
const SECTION_ORDER = ['OPENING', 'TREASURES', 'BIBLE_READING', 'APPLY_YOURSELF', 'LIVING_AS_CHRISTIANS', 'CONCLUSION']
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

function nextNumber(existing: number[]): number {
  return existing.length ? Math.max(...existing) + 1 : 1
}

const emptyForm = {
  assignmentNumber: '1',
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

export default function AssignmentForm({ weekId, publishers, assignment, parts, existingNumbers = [], onClose, onSuccess }: Props) {
  // Modo del modal: 'pick' = elegir parte real de la semana; 'form' = asignar/editar.
  const editingFromTable = !!assignment
  const hasParts = Array.isArray(parts) && parts.length > 0
  const [step, setStep] = useState<'pick' | 'form'>(editingFromTable || !hasParts ? 'form' : 'pick')
  const [manual, setManual] = useState<boolean>(editingFromTable ? true : !hasParts)
  const [editingId, setEditingId] = useState<string | null>(assignment?.id ?? null)
  const [selectedProgramItemId, setSelectedProgramItemId] = useState<string | null>(assignment?.programItemId ?? null)
  const [selectedPartTitle, setSelectedPartTitle] = useState<string>('')

  // Filtros del selector de partes.
  const [partFilter, setPartFilter] = useState<'unassigned' | 'assigned' | 'all'>('unassigned')
  const [sectionFilter, setSectionFilter] = useState<string>('ALL')

  const [form, setForm] = useState(() => {
    if (assignment) {
      return {
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
      }
    }
    return { ...emptyForm, assignmentNumber: String(nextNumber(existingNumbers)) }
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [error, setError] = useState('')

  const isEditing = !!editingId
  const isManual = manual && !editingId
  const showCompanion = typeNeedsCompanion(form.assignmentType)
  const rule = getAssignmentTypeRule(form.assignmentType)

  // Partes asignables (excluye informativas como canciones).
  const assignableParts = useMemo(() => (parts || []).filter((p) => p.requiresAssignee !== false), [parts])

  const filteredGroups = useMemo(() => {
    let list = assignableParts
    if (partFilter === 'unassigned') list = list.filter((p) => !p.assignment)
    else if (partFilter === 'assigned') list = list.filter((p) => !!p.assignment)
    if (sectionFilter !== 'ALL') list = list.filter((p) => p.section === sectionFilter)
    const bySection = new Map<string, WeekPart[]>()
    for (const p of list) {
      const key = p.section || 'OTHER'
      if (!bySection.has(key)) bySection.set(key, [])
      bySection.get(key)!.push(p)
    }
    const orderIdx = (s: string) => {
      const i = SECTION_ORDER.indexOf(s)
      return i === -1 ? SECTION_ORDER.length : i
    }
    return Array.from(bySection.entries())
      .sort(([a], [b]) => orderIdx(a) - orderIdx(b) || a.localeCompare(b))
      .map(([section, items]) => ({ section, items: items.slice().sort((x, y) => x.sortOrder - y.sortOrder) }))
  }, [assignableParts, partFilter, sectionFilter])

  const sectionsPresent = useMemo(() => {
    const set = new Set(assignableParts.map((p) => p.section))
    return SECTION_ORDER.filter((s) => set.has(s))
  }, [assignableParts])

  // Candidatos elegibles (capacidad + género) para la parte/tipo actual.
  const assignedOptions = publishers.filter((p) =>
    isPublisherEligibleForAssignment(
      {
        isActive: p.isActive,
        canReceiveAssignments: p.canReceiveAssignments,
        canBeCompanion: p.canBeCompanion,
        gender: p.gender as GenderValue | null,
        canBibleReading: p.canBibleReading,
        canGiveTalk: p.canGiveTalk,
        canParticipateSMM: p.canParticipateSMM,
        canBeChairman: p.canBeChairman,
        canTreasures: p.canTreasures,
        canSpiritualGems: p.canSpiritualGems,
        canChristianLife: p.canChristianLife,
        canConductCBS: p.canConductCBS,
        canReadCBS: p.canReadCBS,
      },
      form.assignmentType,
      'ASSIGNEE',
    ),
  )

  const assignedGender = (publishers.find((p) => p.id === form.assignedPublisherId)?.gender ?? null) as GenderValue | null
  const companionOptions = publishers.filter(
    (p) =>
      isPublisherEligibleForAssignment(
        {
          isActive: p.isActive,
          canReceiveAssignments: p.canReceiveAssignments,
          canBeCompanion: p.canBeCompanion,
          gender: p.gender as GenderValue | null,
          canBibleReading: p.canBibleReading,
          canGiveTalk: p.canGiveTalk,
          canParticipateSMM: p.canParticipateSMM,
        },
        form.assignmentType,
        'COMPANION',
      ) &&
      p.id !== form.assignedPublisherId &&
      isCompanionGenderAllowed(form.assignmentType, assignedGender, p.gender as GenderValue | null),
  )

  // ─── Selección de una parte pendiente (crear) ───
  function pickUnassignedPart(part: WeekPart) {
    setError('')
    setManual(false)
    setEditingId(null)
    setSelectedProgramItemId(part.id)
    setSelectedPartTitle(part.title)
    setForm({
      ...emptyForm,
      assignmentNumber: String(part.itemNumber ?? nextNumber(existingNumbers)),
      assignmentType: part.assignmentType,
      title: part.title,
      durationMinutes: part.durationMinutes ? String(part.durationMinutes) : String(deriveDurationMinutes(part.assignmentType)),
    })
    setStep('form')
  }

  // ─── Editar la asignación existente de una parte (no duplicar) ───
  async function editAssignedPart(part: WeekPart) {
    if (!part.assignment) return
    setError('')
    setLoadingEdit(true)
    try {
      const res = await api(`/api/assignments/${part.assignment.id}`)
      if (!res.ok) { setError('No se pudo cargar la asignación'); return }
      const a = await res.json()
      setManual(false)
      setEditingId(a.id)
      setSelectedProgramItemId(part.id)
      setSelectedPartTitle(part.title)
      setForm({
        assignmentNumber: String(a.assignmentNumber),
        assignmentType: a.assignmentType,
        title: a.title,
        durationMinutes: a.durationMinutes ? String(a.durationMinutes) : String(deriveDurationMinutes(a.assignmentType)),
        context: a.context || '',
        reference: a.reference || '',
        assignedPublisherId: a.assignedPublisherId,
        companionPublisherId: a.companionPublisherId || '',
        room: a.room,
        notes: a.notes || '',
      })
      setStep('form')
    } catch {
      setError('Error de conexión')
    } finally {
      setLoadingEdit(false)
    }
  }

  function startManual() {
    setError('')
    setManual(true)
    setEditingId(null)
    setSelectedProgramItemId(null)
    setSelectedPartTitle('')
    setForm({ ...emptyForm, assignmentNumber: String(nextNumber(existingNumbers)), title: deriveTitle('START_CONVERSATION'), durationMinutes: String(deriveDurationMinutes('START_CONVERSATION')) })
    setStep('form')
  }

  function handleTypeChange(type: string) {
    setForm((prev) => {
      const next = { ...prev, assignmentType: type, title: deriveTitle(type), durationMinutes: String(deriveDurationMinutes(type)) }
      if (!typeNeedsCompanion(type)) next.companionPublisherId = ''
      if (prev.assignedPublisherId) {
        const g = (publishers.find((p) => p.id === prev.assignedPublisherId)?.gender ?? null) as GenderValue | null
        if (!isAssigneeGenderAllowed(type, g)) { next.assignedPublisherId = ''; next.companionPublisherId = '' }
      }
      return next
    })
  }

  function handleAssignedChange(id: string) {
    setForm((prev) => {
      const next = { ...prev, assignedPublisherId: id }
      if (next.companionPublisherId) {
        const ag = (publishers.find((p) => p.id === id)?.gender ?? null) as GenderValue | null
        const cg = (publishers.find((p) => p.id === next.companionPublisherId)?.gender ?? null) as GenderValue | null
        if (!isCompanionGenderAllowed(prev.assignmentType, ag, cg) || id === next.companionPublisherId) next.companionPublisherId = ''
      }
      return next
    })
  }

  function validate(): string | null {
    if (!form.title.trim()) return 'El titulo es obligatorio'
    if (!form.assignedPublisherId) return 'Debes seleccionar una persona'
    const durationRelevant = !typeHasNoDuration(form.assignmentType) && form.assignmentType !== 'OPENING_COMMENTS'
    if (durationRelevant && form.durationMinutes && (isNaN(Number(form.durationMinutes)) || Number(form.durationMinutes) < 1)) return 'La duracion debe ser un numero positivo'
    if (form.assignedPublisherId && form.companionPublisherId && form.assignedPublisherId === form.companionPublisherId) return 'La persona y el acompanante no pueden ser la misma'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const validationError = validate()
    if (validationError) { setError(validationError); return }
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
      if (typeHasNoDuration(form.assignmentType)) {
        // Presidente y oraciones: sin duración (no se envía; queda null).
      } else if (form.assignmentType === 'OPENING_COMMENTS') {
        body.durationMinutes = 1 // informativa
      } else if (form.durationMinutes) {
        body.durationMinutes = Number(form.durationMinutes)
      }
      if (form.context.trim()) body.context = form.context.trim()
      if (form.reference.trim()) body.reference = form.reference.trim()
      if (showCompanion && form.companionPublisherId) body.companionPublisherId = form.companionPublisherId
      if (form.notes.trim()) body.notes = form.notes.trim()
      if (selectedProgramItemId) body.programItemId = selectedProgramItemId

      const url = isEditing ? `/api/assignments/${editingId}` : '/api/assignments'
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

  // ─── Render: paso "elegir parte real de la semana" ───
  if (step === 'pick') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white rounded-card p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-semibold text-ink tracking-tight mb-1">Partes de esta semana</h2>
          <p className="text-sm text-graphite mb-4">Elige una parte real de la semana para asignarla. Las canciones no se asignan.</p>
          {error && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{error}</p>}

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="inline-flex rounded-pill border border-silver-mist overflow-hidden">
              {([['unassigned', 'Sin asignar'], ['assigned', 'Asignadas'], ['all', 'Todas']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPartFilter(val)}
                  className={`text-xs font-medium px-3 py-1.5 transition-colors ${partFilter === val ? 'bg-azure text-white' : 'text-graphite hover:bg-fog'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="text-xs border border-silver-mist rounded-pill px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-azure/30"
            >
              <option value="ALL">Todas las secciones</option>
              {sectionsPresent.map((s) => <option key={s} value={s}>{sectionLabel(s)}</option>)}
            </select>
          </div>

          {assignableParts.length === 0 ? (
            <p className="text-sm text-graphite text-center py-8">Esta semana no tiene partes asignables importadas. Usa &quot;Agregar parte manual&quot;.</p>
          ) : filteredGroups.length === 0 ? (
            <p className="text-sm text-graphite text-center py-8">No hay partes que coincidan con el filtro.</p>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group) => (
                <div key={group.section}>
                  <p className="text-xs font-semibold text-ink uppercase tracking-wide mb-1.5">{sectionLabel(group.section)}</p>
                  <div className="space-y-1.5">
                    {group.items.map((part) => {
                      const assigned = !!part.assignment
                      return (
                        <button
                          key={part.id}
                          type="button"
                          disabled={loadingEdit}
                          onClick={() => (assigned ? editAssignedPart(part) : pickUnassignedPart(part))}
                          className="w-full text-left px-4 py-2.5 rounded-xl border border-silver-mist hover:border-azure hover:bg-azure/5 transition-colors flex items-center justify-between gap-3 disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="text-sm text-ink font-medium">
                              {part.itemNumber != null ? `${part.itemNumber}. ` : ''}{part.title}
                            </span>
                            <span className="block text-xs text-graphite">
                              {part.durationMinutes ? `${part.durationMinutes} min` : 'Sin duración'}
                            </span>
                          </span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-pill flex-shrink-0 ${assigned ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {assigned ? `Asignada: ${part.assignment!.assignedName || 'sí'}` : 'Sin asignar'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-5 mt-4 border-t border-silver-mist">
            <button type="button" onClick={startManual} className="text-sm font-medium text-azure hover:opacity-80">
              + Agregar parte manual
            </button>
            <button type="button" onClick={onClose} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render: paso "asignar / editar" ───
  const canGoBackToPick = hasParts && !editingFromTable
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-card p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-ink tracking-tight mb-1">
          {isEditing ? 'Editar asignacion' : isManual ? 'Agregar parte manual' : 'Asignar parte'}
        </h2>
        {!isManual && selectedPartTitle && (
          <p className="text-sm text-ink font-medium mb-1">Parte: {selectedPartTitle}</p>
        )}
        <p className="text-sm text-graphite mb-5">Solo aparecen las personas con la capacidad requerida para esta parte.</p>

        {error && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Parte: en manual es un select genérico; en flujo por parte es fija. */}
          {isManual ? (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Parte (manual)</label>
              <select
                value={form.assignmentType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
              >
                {ASSIGNMENT_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          ) : (
            <div className="text-xs text-graphite p-2.5 bg-fog rounded-xl">
              {getAssignmentTypeRule(form.assignmentType).label}
              {form.durationMinutes ? ` — ${form.durationMinutes} min` : ''}
            </div>
          )}
          {rule.allowedAssigneeGenders.length > 0 && (
            <p className="text-xs text-graphite -mt-2">Esta parte solo puede asignarse a hombres.</p>
          )}
          {form.assignmentType === 'OPENING_PRAYER' && (
            <p className="text-xs text-graphite -mt-2">Por defecto la realiza el presidente. Puedes cambiarla a otra persona capacitada.</p>
          )}
          {form.assignmentType === 'OPENING_COMMENTS' && (
            <p className="text-xs text-graphite -mt-2">Normalmente las realiza el presidente.</p>
          )}
          {form.assignmentType === 'CLOSING_PRAYER' && (
            <p className="text-xs text-graphite -mt-2">No necesariamente la hace el presidente; puede asignarse a cualquier persona capacitada.</p>
          )}

          {/* Persona */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Persona</label>
            <SearchableSelect
              required
              value={form.assignedPublisherId}
              onChange={handleAssignedChange}
              options={assignedOptions.map((p) => ({ value: p.id, label: p.displayName || p.fullName }))}
              placeholder="Seleccionar persona"
              searchPlaceholder="Buscar publicador..."
            />
            {assignedOptions.length === 0 && (
              <p className="text-xs text-red-600 mt-1.5">No hay publicadores con la capacidad requerida para esta parte (revisa capacidades, género y estado activo).</p>
            )}
          </div>

          {/* Acompanante */}
          {showCompanion && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Acompanante</label>
              <SearchableSelect
                value={form.companionPublisherId}
                onChange={(id) => setForm({ ...form, companionPublisherId: id })}
                options={companionOptions.map((p) => ({ value: p.id, label: p.displayName || p.fullName }))}
                placeholder="Sin acompanante"
                emptyOptionLabel="Sin acompanante"
                searchPlaceholder="Buscar acompanante..."
              />
              {rule.companionSameGender && (
                <p className="text-xs text-graphite mt-1.5">El acompanante debe ser del mismo sexo que la persona asignada.</p>
              )}
            </div>
          )}

          {/* Duracion — se oculta en presidente y oraciones (no se cronometran);
              en palabras de introducción es informativa (1 min). */}
          {typeHasNoDuration(form.assignmentType) ? (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Duración</label>
              <p className="text-sm text-graphite px-4 py-2.5 bg-fog rounded-xl">Sin duración</p>
            </div>
          ) : form.assignmentType === 'OPENING_COMMENTS' ? (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Duración</label>
              <p className="text-sm text-graphite px-4 py-2.5 bg-fog rounded-xl">1 min (informativa)</p>
            </div>
          ) : (
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
          )}

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
            <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-sm text-azure font-medium hover:opacity-80 transition-opacity">
              {showAdvanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas'}
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 border-t border-silver-mist pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Numero</label>
                  <input type="number" min={1} value={form.assignmentNumber} onChange={(e) => setForm({ ...form, assignmentNumber: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Sala</label>
                  <select value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white">
                    {ROOMS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              {isManual && (
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Titulo personalizado</label>
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" placeholder="Titulo de la asignacion" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Referencia</label>
                <input type="text" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" placeholder="Ej: Salmo 23:1-6" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Contexto</label>
                <input type="text" value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" placeholder="Contexto de la asignacion" />
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear asignacion'}
            </button>
            {canGoBackToPick ? (
              <button type="button" onClick={() => { setStep('pick'); setError('') }} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
                Volver a partes
              </button>
            ) : (
              <button type="button" onClick={onClose} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
