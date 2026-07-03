'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Template {
  id: string
  type: string
  title: string
  body: string
}

// Metadatos de presentación: nombre amigable, grupo y orden por momento del mensaje.
type GroupId = 'auto' | 'special' | 'otros'
const TYPE_META: Record<string, { label: string; group: GroupId; order: number }> = {
  INITIAL_NOTICE_ASSIGNED:  { label: 'Aviso inicial — asignado',        group: 'auto',    order: 1 },
  INITIAL_NOTICE_COMPANION: { label: 'Aviso inicial — acompañante',     group: 'auto',    order: 2 },
  SEVEN_DAYS_BEFORE:        { label: 'Recordatorio — 7 días antes',     group: 'auto',    order: 3 },
  THREE_DAYS_BEFORE:        { label: 'Recordatorio — 3 días antes',     group: 'auto',    order: 4 },
  ONE_DAY_BEFORE:           { label: 'Recordatorio — 1 día antes',      group: 'auto',    order: 5 },
  CHANGE_NOTICE:            { label: 'Aviso de cambio de asignación',   group: 'special', order: 6 },
  CANCELLATION_NOTICE:      { label: 'Aviso de cancelación',            group: 'special', order: 7 },
}

const GROUPS: { id: GroupId; title: string; note?: string }[] = [
  {
    id: 'auto',
    title: 'Mensajes automáticos (formato unificado)',
    note:
      'Estos mensajes se generan automáticamente con el formato unificado (fecha, ' +
      'sección, título y rol/acompañante). El texto de abajo es solo de referencia: ' +
      'el envío real lo compone el sistema por persona, agrupando todas sus partes.',
  },
  {
    id: 'special',
    title: 'Avisos especiales (editables)',
    note: 'Estos sí se envían a partir de esta plantilla. Puedes editar su texto.',
  },
  { id: 'otros', title: 'Otras plantillas' },
]

function metaFor(type: string) {
  return TYPE_META[type] ?? { label: type, group: 'otros' as GroupId, order: 99 }
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

  const sorted = [...templates].sort((a, b) => metaFor(a.type).order - metaFor(b.type).order)
  const groupsWithItems = GROUPS
    .map((g) => ({ ...g, items: sorted.filter((t) => metaFor(t.type).group === g.id) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Plantillas de mensaje</h1>
        <p className="text-sm text-graphite mt-1">
          Organizadas por momento del mensaje. Los mensajes automáticos usan el formato unificado del sistema.
        </p>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-card p-7 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-1">Editar plantilla</h2>
            <p className="text-xs text-graphite mb-5">{metaFor(editing.type).label}</p>
            {metaFor(editing.type).group === 'auto' && (
              <div className="mb-4 text-xs text-graphite bg-fog rounded-xl p-3">
                Nota: este mensaje se genera automáticamente. Editar aquí no cambia el envío real
                (se conserva como referencia).
              </div>
            )}
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

      {/* Grupos */}
      {groupsWithItems.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <p className="text-graphite text-sm">No hay plantillas configuradas</p>
        </div>
      ) : (
        groupsWithItems.map((g) => (
          <section key={g.id} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">{g.title}</h2>
              {g.note && <p className="text-xs text-graphite mt-1 max-w-2xl">{g.note}</p>}
            </div>
            <div className="space-y-3">
              {g.items.map((t) => (
                <div key={t.id} className="bg-white rounded-card p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-white bg-azure px-2.5 py-1 rounded-pill">{metaFor(t.type).label}</span>
                      <h3 className="text-sm font-semibold text-ink">{t.title}</h3>
                    </div>
                    <button onClick={() => openEdit(t)} className="text-azure text-sm font-medium hover:opacity-70">Editar</button>
                  </div>
                  <p className="text-sm text-graphite whitespace-pre-line line-clamp-3">{t.body}</p>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
