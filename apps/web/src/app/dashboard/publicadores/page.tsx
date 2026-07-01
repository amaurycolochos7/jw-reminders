'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  CAPABILITIES,
  APPOINTMENT_OPTIONS,
  suggestCapabilities,
  enforceStrictCapabilities,
  validatePublisherCapabilities,
  type CapabilityKey,
  type GenderValue,
  type AppointmentValue,
} from '@/lib/publisher-capabilities'

interface Publisher {
  id: string
  fullName: string
  displayName: string | null
  phone: string
  whatsappPhone: string | null
  gender: string | null
  isActive: boolean
  isBaptized: boolean
  isRegularPioneer: boolean
  appointment: AppointmentValue
  canReceiveAssignments: boolean
  canBeCompanion: boolean
  canParticipateSMM: boolean
  canBibleReading: boolean
  canGiveTalk: boolean
  canBeChairman: boolean
  canPray: boolean
  canTreasures: boolean
  canSpiritualGems: boolean
  canChristianLife: boolean
  canConductCBS: boolean
  canReadCBS: boolean
  canConcludingRemarks: boolean
  notes: string | null
  deletedAt: string | null
}

/**
 * Strips 521 prefix to show national 10-digit number.
 * 5219610000004 → 9610000004
 */
function toNational(phone: string): string {
  if (phone.startsWith('521') && phone.length === 13) return phone.slice(3)
  return phone
}

type FormState = {
  fullName: string
  displayName: string
  phone: string
  gender: '' | GenderValue
  isActive: boolean
  isBaptized: boolean
  isRegularPioneer: boolean
  appointment: AppointmentValue
  notes: string
} & Record<CapabilityKey, boolean>

const emptyForm: FormState = {
  fullName: '',
  displayName: '',
  phone: '',
  gender: '',
  isActive: true,
  isBaptized: true,
  isRegularPioneer: false,
  appointment: 'NONE',
  notes: '',
  canReceiveAssignments: true,
  canBeCompanion: true,
  canParticipateSMM: true,
  canBibleReading: false,
  canGiveTalk: false,
  canBeChairman: false,
  canPray: false,
  canTreasures: false,
  canSpiritualGems: false,
  canChristianLife: false,
  canConductCBS: false,
  canReadCBS: false,
  canConcludingRemarks: false,
}

const APPOINTMENT_LABEL: Record<AppointmentValue, string> = {
  NONE: '',
  ELDER: 'Anciano',
  MINISTERIAL_SERVANT: 'Siervo ministerial',
}

const BASIC_CAPS = CAPABILITIES.filter((c) => c.group === 'basic')
const MEETING_CAPS = CAPABILITIES.filter((c) => c.group === 'meeting')

/** Accessible toggle switch. */
function Toggle({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className={`flex items-center justify-between gap-3 py-1.5 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="text-sm text-ink">
        {label}
        {hint && <span className="block text-xs text-graphite">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-azure' : 'bg-silver-mist'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )
}

export default function PublicadoresPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Publisher | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Publisher | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : ''
      const res = await api(`/api/publishers${query}`)
      if (res.ok) setPublishers(await res.json())
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [search])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowForm(true)
  }

  function openEdit(p: Publisher) {
    setEditing(p)
    setForm({
      fullName: p.fullName,
      displayName: p.displayName || '',
      phone: toNational(p.phone),
      gender: (p.gender as GenderValue | null) || '',
      isActive: p.isActive,
      isBaptized: p.isBaptized,
      isRegularPioneer: p.isRegularPioneer,
      appointment: p.appointment || 'NONE',
      notes: p.notes || '',
      canReceiveAssignments: p.canReceiveAssignments,
      canBeCompanion: p.canBeCompanion,
      canParticipateSMM: p.canParticipateSMM,
      canBibleReading: p.canBibleReading,
      canGiveTalk: p.canGiveTalk,
      canBeChairman: p.canBeChairman,
      canPray: p.canPray,
      canTreasures: p.canTreasures,
      canSpiritualGems: p.canSpiritualGems,
      canChristianLife: p.canChristianLife,
      canConductCBS: p.canConductCBS,
      canReadCBS: p.canReadCBS,
      canConcludingRemarks: p.canConcludingRemarks,
    })
    setError('')
    setShowForm(true)
  }

  const isFemale = form.gender === 'FEMALE'
  const isMale = form.gender === 'MALE'

  /** Applies a gender change, enforcing strict rules immediately. */
  function changeGender(gender: '' | GenderValue) {
    setForm((prev) => {
      const next = { ...prev, gender }
      if (gender === 'FEMALE') {
        // Strict: clear male-only capabilities and appointment.
        const enforced = enforceStrictCapabilities({ ...next, gender: 'FEMALE' as GenderValue })
        return { ...next, ...enforced, gender }
      }
      return next
    })
  }

  function changeAppointment(appointment: AppointmentValue) {
    setForm((prev) => ({ ...prev, appointment }))
  }

  function setCap(key: CapabilityKey, value: boolean) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /** Fills capabilities with suggestions based on current congregational status. */
  function applySuggestions() {
    setForm((prev) => {
      const suggested = suggestCapabilities({
        gender: prev.gender || null,
        isBaptized: prev.isBaptized,
        appointment: prev.appointment,
      })
      return { ...prev, ...suggested }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Client-side strict validation (backend re-validates authoritatively).
    const capErrors = validatePublisherCapabilities({
      gender: form.gender || null,
      isBaptized: form.isBaptized,
      isRegularPioneer: form.isRegularPioneer,
      appointment: form.appointment,
      canReceiveAssignments: form.canReceiveAssignments,
      canBeCompanion: form.canBeCompanion,
      canParticipateSMM: form.canParticipateSMM,
      canBibleReading: form.canBibleReading,
      canGiveTalk: form.canGiveTalk,
      canBeChairman: form.canBeChairman,
      canPray: form.canPray,
      canTreasures: form.canTreasures,
      canSpiritualGems: form.canSpiritualGems,
      canChristianLife: form.canChristianLife,
      canConductCBS: form.canConductCBS,
      canReadCBS: form.canReadCBS,
      canConcludingRemarks: form.canConcludingRemarks,
    })
    if (capErrors.length > 0) {
      setError(capErrors.join(' '))
      return
    }

    setSaving(true)
    try {
      const body: any = {
        fullName: form.fullName,
        phone: form.phone,
        isActive: form.isActive,
        isBaptized: form.isBaptized,
        isRegularPioneer: form.isRegularPioneer,
        appointment: form.appointment,
        canReceiveAssignments: form.canReceiveAssignments,
        canBeCompanion: form.canBeCompanion,
        canParticipateSMM: form.canParticipateSMM,
        canBibleReading: form.canBibleReading,
        canGiveTalk: form.canGiveTalk,
        canBeChairman: form.canBeChairman,
        canPray: form.canPray,
        canTreasures: form.canTreasures,
        canSpiritualGems: form.canSpiritualGems,
        canChristianLife: form.canChristianLife,
        canConductCBS: form.canConductCBS,
        canReadCBS: form.canReadCBS,
        canConcludingRemarks: form.canConcludingRemarks,
      }
      if (form.displayName) body.displayName = form.displayName
      if (form.gender) body.gender = form.gender
      if (form.notes) body.notes = form.notes

      const url = editing ? `/api/publishers/${editing.id}` : '/api/publishers'
      const method = editing ? 'PUT' : 'POST'
      const res = await api(url, { method, body: JSON.stringify(body) })
      if (res.ok) {
        setShowForm(false)
        await load()
      } else {
        const data = await res.json()
        setError(data.error || 'Error al guardar')
      }
    } catch { setError('Error de conexion') } finally { setSaving(false) }
  }

  async function toggleActive(id: string) {
    await api(`/api/publishers/${id}/toggle-active`, { method: 'PATCH' })
    await load()
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const res = await api(`/api/publishers/${confirmDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        const data = res.status === 204 ? null : await res.json()
        if (data?.softDeleted) {
          // Show brief notification that it was soft-deleted
        }
      }
      setConfirmDelete(null)
      await load()
    } catch {} finally { setDeleting(false) }
  }

  function renderCapToggle(cap: (typeof CAPABILITIES)[number]) {
    const blocked = isFemale && cap.maleOnly
    return (
      <Toggle
        key={cap.key}
        label={cap.label}
        checked={form[cap.key]}
        disabled={blocked}
        hint={blocked ? 'No disponible para mujeres (regla fija)' : undefined}
        onChange={(v) => setCap(cap.key, v)}
      />
    )
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-56 bg-silver-mist rounded-pill" />
      <div className="h-64 bg-white rounded-card" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Publicadores</h1>
        <button onClick={openCreate} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">
          Nuevo publicador
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o telefono..."
          className="w-full pl-10 pr-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
        />
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-card p-7 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">
              {editing ? 'Editar publicador' : 'Nuevo publicador'}
            </h2>
            {error && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ─── 1. Datos básicos ─── */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-ink uppercase tracking-wide">1. Datos básicos</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Nombre completo</label>
                    <input
                      type="text"
                      required
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Nombre visible</label>
                    <input
                      type="text"
                      value={form.displayName}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      placeholder="Nombre corto"
                      className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Telefono nacional</label>
                    <input
                      type="tel"
                      required
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d]/g, '') })}
                      placeholder="9611234567"
                      maxLength={10}
                      className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                    />
                    <p className="text-xs text-graphite mt-1">10 digitos sin prefijo 521</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Genero</label>
                    <select
                      value={form.gender}
                      onChange={(e) => changeGender(e.target.value as '' | GenderValue)}
                      className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
                    >
                      <option value="">Seleccionar</option>
                      <option value="MALE">Masculino</option>
                      <option value="FEMALE">Femenino</option>
                    </select>
                  </div>
                </div>

                <Toggle label="Activo" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
              </section>

              {/* ─── 2. Estado congregacional ─── */}
              <section className="space-y-2 border-t border-silver-mist pt-5">
                <h3 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">2. Estado congregacional</h3>
                <Toggle label="Bautizado" checked={form.isBaptized} onChange={(v) => setForm({ ...form, isBaptized: v })} />
                <Toggle
                  label="Precursor regular"
                  hint="Puede ser hombre o mujer"
                  checked={form.isRegularPioneer}
                  onChange={(v) => setForm({ ...form, isRegularPioneer: v })}
                />
                <div className="pt-2">
                  <label className="block text-sm font-medium text-ink mb-1.5">Nombramiento</label>
                  <select
                    value={form.appointment}
                    disabled={!isMale}
                    onChange={(e) => changeAppointment(e.target.value as AppointmentValue)}
                    className={`w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white ${!isMale ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {APPOINTMENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {!isMale && (
                    <p className="text-xs text-amber-700 mt-1">
                      Solo los hombres pueden ser nombrados (anciano o siervo ministerial).
                    </p>
                  )}
                </div>
              </section>

              {/* ─── 3. Capacidades ─── */}
              <section className="space-y-3 border-t border-silver-mist pt-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-sm font-semibold text-ink uppercase tracking-wide">3. Capacidades</h3>
                  <button
                    type="button"
                    onClick={applySuggestions}
                    className="text-xs font-medium text-azure px-3 py-1.5 rounded-pill border border-azure/30 hover:bg-azure/5 transition-colors"
                  >
                    Sugerir según estado
                  </button>
                </div>
                {isFemale && (
                  <p className="text-xs text-amber-700 p-2.5 bg-amber-50 rounded-xl">
                    Algunas capacidades están reservadas a hombres (reglas fijas) y aparecen deshabilitadas.
                  </p>
                )}

                <div>
                  <p className="text-xs font-medium text-graphite mb-1">Asignaciones básicas</p>
                  <div className="divide-y divide-silver-mist/60">
                    {BASIC_CAPS.map(renderCapToggle)}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-graphite mb-1 mt-2">Partes de la reunión</p>
                  <div className="divide-y divide-silver-mist/60">
                    {MEETING_CAPS.map(renderCapToggle)}
                  </div>
                </div>
              </section>

              {/* ─── 4. Notas ─── */}
              <section className="border-t border-silver-mist pt-5">
                <h3 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">4. Notas</h3>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none"
                />
              </section>

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-card p-7 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-ink tracking-tight">Eliminar publicador</h2>
            </div>
            <p className="text-sm text-graphite mb-2">
              Estas a punto de eliminar a <strong className="text-ink">{confirmDelete.fullName}</strong>.
            </p>
            <p className="text-sm text-graphite mb-6">
              Si tiene historial de asignaciones o mensajes, se conservara como inactivo para no perder registros anteriores.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-400 text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List - responsive card/table */}
      {publishers.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <svg className="w-10 h-10 text-graphite/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
          </svg>
          <p className="text-graphite text-sm">No hay publicadores registrados</p>
        </div>
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="space-y-3 lg:hidden">
            {publishers.map((p) => (
              <div key={p.id} className="bg-white rounded-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{p.fullName}</p>
                    {p.displayName && <p className="text-xs text-graphite">{p.displayName}</p>}
                    <p className="text-xs text-graphite font-mono mt-1">{toNational(p.phone)}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.appointment !== 'NONE' && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-indigo-50 text-indigo-700">{APPOINTMENT_LABEL[p.appointment]}</span>
                      )}
                      {p.isRegularPioneer && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-sky-50 text-sky-700">Precursor</span>
                      )}
                      {!p.isBaptized && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-fog text-graphite">No bautizado</span>
                      )}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-pill flex-shrink-0 ${p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-fog text-graphite'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? 'bg-emerald-500' : 'bg-silver-mist'}`} />
                    {p.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-silver-mist">
                  <button onClick={() => openEdit(p)} className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-azure/5 transition-colors">
                    Editar
                  </button>
                  <button onClick={() => toggleActive(p.id)} className={`text-xs font-medium px-3 py-1.5 rounded-pill transition-colors ${p.isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'}`}>
                    {p.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => setConfirmDelete(p)} className="text-red-600 text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-red-50 transition-colors">
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block bg-white rounded-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-silver-mist">
                    <th className="text-left px-6 py-4 font-medium text-graphite">Nombre</th>
                    <th className="text-left px-6 py-4 font-medium text-graphite">Telefono</th>
                    <th className="text-left px-6 py-4 font-medium text-graphite">Estado</th>
                    <th className="text-left px-6 py-4 font-medium text-graphite">Privilegios</th>
                    <th className="text-right px-6 py-4 font-medium text-graphite">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {publishers.map((p) => (
                    <tr key={p.id} className="border-b border-silver-mist last:border-0 hover:bg-fog/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-ink font-medium">{p.fullName}</span>
                        {p.displayName && <span className="text-graphite text-xs ml-2">({p.displayName})</span>}
                      </td>
                      <td className="px-6 py-4 text-graphite font-mono text-xs">{toNational(p.phone)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill ${p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-fog text-graphite'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? 'bg-emerald-500' : 'bg-silver-mist'}`} />
                          {p.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {p.appointment !== 'NONE' && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-indigo-50 text-indigo-700">{APPOINTMENT_LABEL[p.appointment]}</span>
                          )}
                          {p.isRegularPioneer && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-sky-50 text-sky-700">Precursor</span>
                          )}
                          {!p.isBaptized && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-fog text-graphite">No bautizado</span>
                          )}
                          {p.appointment === 'NONE' && !p.isRegularPioneer && p.isBaptized && (
                            <span className="text-xs text-graphite">Publicador</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(p)} className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-azure/5 transition-colors">
                            Editar
                          </button>
                          <button onClick={() => toggleActive(p.id)} className={`text-xs font-medium px-3 py-1.5 rounded-pill transition-colors ${p.isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'}`}>
                            {p.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                          <button onClick={() => setConfirmDelete(p)} className="text-red-600 text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-red-50 transition-colors">
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
