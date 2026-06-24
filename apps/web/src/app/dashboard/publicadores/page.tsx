'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Publisher {
  id: string
  fullName: string
  displayName: string | null
  phone: string
  whatsappPhone: string | null
  gender: string | null
  isActive: boolean
  canReceiveAssignments: boolean
  canBeCompanion: boolean
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

const emptyForm = {
  fullName: '',
  displayName: '',
  phone: '',
  gender: '',
  isActive: true,
  canReceiveAssignments: true,
  canBeCompanion: true,
  notes: '',
}

export default function PublicadoresPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Publisher | null>(null)
  const [form, setForm] = useState(emptyForm)
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
      gender: p.gender || '',
      isActive: p.isActive,
      canReceiveAssignments: p.canReceiveAssignments,
      canBeCompanion: p.canBeCompanion,
      notes: p.notes || '',
    })
    setError('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body: any = {
        fullName: form.fullName,
        phone: form.phone,
        isActive: form.isActive,
        canReceiveAssignments: form.canReceiveAssignments,
        canBeCompanion: form.canBeCompanion,
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
          onChange={(e) => { setSearch(e.target.value); setLoading(true) }}
          placeholder="Buscar por nombre o telefono..."
          className="w-full pl-10 pr-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
        />
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-card p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">
              {editing ? 'Editar publicador' : 'Nuevo publicador'}
            </h2>
            {error && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
                >
                  <option value="">Seleccionar</option>
                  <option value="MALE">Masculino</option>
                  <option value="FEMALE">Femenino</option>
                </select>
              </div>

              <div className="space-y-2 border-t border-silver-mist pt-4">
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-silver-mist text-azure focus:ring-azure/30"
                  />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.canReceiveAssignments}
                    onChange={(e) => setForm({ ...form, canReceiveAssignments: e.target.checked })}
                    className="w-4 h-4 rounded border-silver-mist text-azure focus:ring-azure/30"
                  />
                  Puede recibir asignaciones
                </label>
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.canBeCompanion}
                    onChange={(e) => setForm({ ...form, canBeCompanion: e.target.checked })}
                    className="w-4 h-4 rounded border-silver-mist text-azure focus:ring-azure/30"
                  />
                  Puede ser acompanante
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
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
                className="bg-red-600 text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:bg-red-700 disabled:opacity-50"
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

      {/* Table */}
      {publishers.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <svg className="w-10 h-10 text-graphite/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
          </svg>
          <p className="text-graphite text-sm">No hay publicadores registrados</p>
        </div>
      ) : (
        <div className="bg-white rounded-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-silver-mist">
                  <th className="text-left px-6 py-4 font-medium text-graphite">Nombre</th>
                  <th className="text-left px-6 py-4 font-medium text-graphite">Telefono</th>
                  <th className="text-left px-6 py-4 font-medium text-graphite">Estado</th>
                  <th className="text-left px-6 py-4 font-medium text-graphite">Asignaciones</th>
                  <th className="text-left px-6 py-4 font-medium text-graphite">Acompanante</th>
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
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill ${p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {p.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs ${p.canReceiveAssignments ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {p.canReceiveAssignments ? 'Si' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs ${p.canBeCompanion ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {p.canBeCompanion ? 'Si' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-azure/5 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => toggleActive(p.id)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-pill transition-colors ${
                            p.isActive
                              ? 'text-amber-700 hover:bg-amber-50'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {p.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p)}
                          className="text-red-600 text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-red-50 transition-colors"
                        >
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
      )}
    </div>
  )
}
