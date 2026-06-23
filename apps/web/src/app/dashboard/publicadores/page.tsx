'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Publisher {
  id: string
  name: string
  phone: string
  active: boolean
}

export default function PublicadoresPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Publisher | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', active: true })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const res = await api('/api/publishers')
      if (res.ok) setPublishers(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', phone: '', active: true })
    setShowForm(true)
  }

  function openEdit(p: Publisher) {
    setEditing(p)
    setForm({ name: p.name, phone: p.phone, active: p.active })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await api(`/api/publishers/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await api('/api/publishers', { method: 'POST', body: JSON.stringify(form) })
      }
      setShowForm(false)
      await load()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminar este publicador?')) return
    await api(`/api/publishers/${id}`, { method: 'DELETE' })
    await load()
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-56 bg-silver-mist rounded-pill" />
        <div className="h-64 bg-white rounded-card" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Publicadores</h1>
        <button onClick={openCreate} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">
          Nuevo publicador
        </button>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-card p-7 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">{editing ? 'Editar publicador' : 'Nuevo publicador'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Nombre</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Telefono</label>
                <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
                Activo
              </label>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table or empty */}
      {publishers.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <p className="text-graphite text-sm">No hay publicadores registrados</p>
        </div>
      ) : (
        <div className="bg-white rounded-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-silver-mist">
                  <th className="text-left px-7 py-4 font-medium text-graphite">Nombre</th>
                  <th className="text-left px-7 py-4 font-medium text-graphite">Telefono</th>
                  <th className="text-left px-7 py-4 font-medium text-graphite">Estado</th>
                  <th className="text-right px-7 py-4 font-medium text-graphite">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {publishers.map((p) => (
                  <tr key={p.id} className="border-b border-silver-mist last:border-0">
                    <td className="px-7 py-4 text-ink font-medium">{p.name}</td>
                    <td className="px-7 py-4 text-graphite">{p.phone}</td>
                    <td className="px-7 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {p.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-7 py-4 text-right">
                      <button onClick={() => openEdit(p)} className="text-azure text-sm font-medium mr-4 hover:opacity-70">Editar</button>
                      <button onClick={() => handleDelete(p.id)} className="text-red-500 text-sm font-medium hover:opacity-70">Eliminar</button>
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
