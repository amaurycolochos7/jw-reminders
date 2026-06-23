'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Template {
  id: string
  type: string
  title: string
  body: string
}

export default function PlantillasPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState({ title: '', body: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const res = await api('/api/message-templates')
      if (res.ok) setTemplates(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openEdit(t: Template) {
    setEditing(t)
    setForm({ title: t.title, body: t.body })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      await api(`/api/message-templates/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) })
      setEditing(null)
      await load()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-silver-mist rounded-pill" />
        <div className="h-64 bg-white rounded-card" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink tracking-tight">Plantillas de mensaje</h1>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-card p-7 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">Editar plantilla</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Titulo</label>
                <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Cuerpo del mensaje</label>
                <textarea required rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setEditing(null)} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <p className="text-graphite text-sm">No hay plantillas configuradas</p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-card p-7">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-graphite bg-fog px-2.5 py-1 rounded-pill">{t.type}</span>
                  <h3 className="text-sm font-semibold text-ink">{t.title}</h3>
                </div>
                <button onClick={() => openEdit(t)} className="text-azure text-sm font-medium hover:opacity-70">Editar</button>
              </div>
              <p className="text-sm text-graphite line-clamp-2">{t.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
