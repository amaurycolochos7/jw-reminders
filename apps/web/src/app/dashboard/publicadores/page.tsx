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
}

const emptyForm = {
  fullName: '', displayName: '', phone: '', whatsappPhone: '',
  gender: '', isActive: true, canReceiveAssignments: true, canBeCompanion: true, notes: ''
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
      phone: p.phone,
      whatsappPhone: p.whatsappPhone || '',
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
      const body: any = { ...form }
      if (!body.displayName) delete body.displayName
      if (!body.whatsappPhone) body.whatsappPhone = body.phone
      if (!body.gender) delete body.gender
      if (!body.notes) delete body.notes

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

  if (loading) return <div className="space-y-4 animate-pulse"><div className="h-8 w-56 bg-silver-mist rounded-pill" /><div className="h-64 bg-white rounded-card" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Publicadores</h1>
        <button onClick={openCreate} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">Nuevo publicador</button>
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
          placeholder="Buscar por nombre..."
          className="w-full pl-10 pr-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
        />
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-card p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">{editing ? 'Editar publicador' : 'Nuevo publicador'}</h2>
            {error && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Nombre completo</label>
                  <input type="text" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Nombre visible</label>
                  <input type="text" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Nombre corto" className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Telefono</label>
                  <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5219611234567" className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">WhatsApp</label>
                  <input type="tel" value={form.whatsappPhone} onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })} placeholder="Mismo que telefono" className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Genero</label>
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white">
                  <option value="">Seleccionar</option>
                  <option value="MALE">Masculino</option>
                  <option value="FEMALE">Femenino</option>
                </select>
              </div>
              <div className="space-y-2 border-t border-silver-mist pt-4">
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 rounded border-silver-mist text-azure focus:ring-azure/30" />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input type="checkbox" checked={form.canReceiveAssignments} onChange={(e) => setForm({ ...form, canReceiveAssignments: e.target.checked })} className="w-4 h-4 rounded border-silver-mist text-azure focus:ring-azure/30" />
                  Puede recibir asignaciones
                </label>
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input type="checkbox" checked={form.canBeCompanion} onChange={(e) => setForm({ ...form, canBeCompanion: e.target.checked })} className="w-4 h-4 rounded border-silver-mist text-azure focus:ring-azure/30" />
                  Puede ser acompanante
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Notas</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog">Cancelar</button>
              </div>
            </form>
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
          <table className="w-full text-sm">
            <thead><tr className="border-b border-silver-mist">
              <th className="text-left px-7 py-4 font-medium text-graphite">Nombre</th>
              <th className="text-left px-7 py-4 font-medium text-graphite">Telefono</th>
              <th className="text-left px-7 py-4 font-medium text-graphite">Genero</th>
              <th className="text-left px-7 py-4 font-medium text-graphite">Estado</th>
              <th className="text-right px-7 py-4 font-medium text-graphite">Acciones</th>
            </tr></thead>
            <tbody>{publishers.map((p) => (
              <tr key={p.id} className="border-b border-silver-mist last:border-0">
                <td className="px-7 py-4">
                  <span className="text-ink font-medium">{p.fullName}</span>
                  {p.displayName && <span className="text-graphite text-xs ml-2">({p.displayName})</span>}
                </td>
                <td className="px-7 py-4 text-graphite">{p.phone}</td>
                <td className="px-7 py-4 text-graphite">{p.gender === 'MALE' ? 'M' : p.gender === 'FEMALE' ? 'F' : '—'}</td>
                <td className="px-7 py-4">
                  <button onClick={() => toggleActive(p.id)} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill ${p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    {p.isActive ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-7 py-4 text-right">
                  <button onClick={() => openEdit(p)} className="text-azure text-sm hover:opacity-70">Editar</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
