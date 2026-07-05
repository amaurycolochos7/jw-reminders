'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import Portal from '@/components/Portal'

interface Template {
  id: string
  type: string
  title: string
  body: string
  description: string | null
  isActive: boolean
  activeVersion: number
  updatedAt: string
  connectedToSend: boolean
  isLegacy: boolean
}

interface VariableDef {
  name: string
  description: string
  example: string
  appliesTo: string[]
  required: boolean
}

interface Version { id: string; version: number; body: string; createdAt: string; isActive: boolean; createdBy: string | null }

const TYPE_LABEL: Record<string, string> = {
  INITIAL_NOTICE: 'Aviso inicial (mensual)',
  SEVEN_DAYS_BEFORE: 'Recordatorio — 7 días antes',
  THREE_DAYS_BEFORE: 'Recordatorio — 3 días antes',
  ONE_DAY_BEFORE: 'Recordatorio — 1 día antes',
  CHANGE_NOTICE: 'Cambio de asignación',
}

export default function PlantillasPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [variables, setVariables] = useState<VariableDef[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [versionsFor, setVersionsFor] = useState<Template | null>(null)
  const [versions, setVersions] = useState<Version[]>([])

  const [form, setForm] = useState({ title: '', body: '', description: '', variants: [] as string[] })
  const [preview, setPreview] = useState<{ rendered: string; warnings: string[]; invalidVariables: string[] }>({ rendered: '', warnings: [], invalidVariables: [] })
  const [saving, setSaving] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  async function load() {
    try {
      const [tRes, vRes] = await Promise.all([api('/api/message-templates'), api('/api/message-templates/variables')])
      if (tRes.ok) setTemplates(await tRes.json())
      if (vRes.ok) setVariables(await vRes.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Preview en vivo (render ÚNICO del backend) con debounce.
  const refreshPreview = useCallback(async (id: string, body: string) => {
    try {
      const res = await api(`/api/message-templates/${id}/preview`, { method: 'POST', body: JSON.stringify({ body }) })
      if (res.ok) setPreview(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!editing) return
    const t = setTimeout(() => refreshPreview(editing.id, form.body), 400)
    return () => clearTimeout(t)
  }, [editing, form.body, refreshPreview])

  function openEdit(t: Template) {
    setEditing(t)
    setForm({ title: t.title, body: t.body, description: t.description ?? '', variants: Array.isArray((t as any).variants) ? (t as any).variants : [] })
    setPreview({ rendered: '', warnings: [], invalidVariables: [] })
  }

  function insertVariable(name: string) {
    const ta = bodyRef.current
    const token = `{{${name}}}`
    if (!ta) { setForm((f) => ({ ...f, body: f.body + token })); return }
    const start = ta.selectionStart ?? ta.value.length
    const end = ta.selectionEnd ?? ta.value.length
    const next = form.body.slice(0, start) + token + form.body.slice(end)
    setForm((f) => ({ ...f, body: next }))
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + token.length })
  }

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    try {
      await api(`/api/message-templates/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) })
      setEditing(null)
      await load()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  async function openVersions(t: Template) {
    setVersionsFor(t)
    const res = await api(`/api/message-templates/${t.id}/versions`)
    if (res.ok) setVersions(await res.json())
  }

  if (loading) return <div className="h-64 bg-white rounded-card animate-pulse" />

  const active = templates.filter((t) => t.connectedToSend)
  const legacy = templates.filter((t) => !t.connectedToSend)
  const varsForType = (type: string) => variables.filter((v) => v.appliesTo.includes(type))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Plantillas de mensaje</h1>
        <p className="text-sm text-graphite mt-1">
          Estas plantillas son la <strong>fuente real</strong> de los mensajes. Al guardar se crea una versión nueva;
          los mensajes ya generados no cambian.
        </p>
      </div>

      {/* ACTIVAS */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Plantillas activas (conectadas al envío)</h2>
        <div className="space-y-3">
          {active.map((t) => (
            <div key={t.id} className="bg-white rounded-card p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-medium text-white bg-azure px-2.5 py-1 rounded-pill">{TYPE_LABEL[t.type] ?? t.type}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">● Conectada al envío real</span>
                  <span className="text-[11px] text-graphite">v{t.activeVersion}</span>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => openVersions(t)} className="text-graphite text-sm hover:text-ink">Versiones</button>
                  <button onClick={() => openEdit(t)} className="text-azure text-sm font-medium hover:opacity-70">Editar</button>
                </div>
              </div>
              <p className="text-sm text-graphite whitespace-pre-line line-clamp-3 font-mono">{t.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* LEGACY */}
      {legacy.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-graphite uppercase tracking-wide">Legacy / inactivas (no afectan el envío)</h2>
          <div className="space-y-2">
            {legacy.map((t) => (
              <div key={t.id} className="bg-fog/60 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-graphite">{t.title} <span className="text-[11px]">({t.type})</span></span>
                <span className="text-[11px] font-medium text-graphite bg-silver-mist px-2 py-0.5 rounded-full">inactiva</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* EDITOR + PREVIEW */}
      {editing && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-card w-full max-w-5xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-silver-mist flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink tracking-tight">{TYPE_LABEL[editing.type] ?? editing.type}</h2>
                <p className="text-xs text-graphite">Editar cuerpo → al guardar se crea la versión v{editing.activeVersion + 1}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-graphite hover:text-ink text-sm">Cerrar</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
              {/* Editor */}
              <div className="lg:col-span-2 p-6 space-y-4 border-r border-silver-mist">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Título</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Cuerpo (formato WhatsApp: *negritas*, _cursivas_, saltos, emojis)</label>
                  <textarea ref={bodyRef} rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                    className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm font-mono resize-y" />
                </div>

                {/* Variantes anti-ban */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-ink">Variantes ({form.variants.length + 1} total)</label>
                    <button type="button" onClick={() => setForm({ ...form, variants: [...form.variants, form.body] })}
                      className="text-xs font-medium text-azure hover:opacity-80">+ Agregar variante</button>
                  </div>
                  <p className="text-[11px] text-graphite">Cada envío usa una variante al azar. Así ningún mensaje es idéntico (anti-ban).</p>
                  {form.variants.map((v, i) => (
                    <div key={i} className="relative">
                      <textarea rows={6} value={v}
                        onChange={(e) => { const copy = [...form.variants]; copy[i] = e.target.value; setForm({ ...form, variants: copy }) }}
                        className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm font-mono resize-y pr-16"
                        placeholder={`Variante ${i + 2}`} />
                      <button type="button" onClick={() => { const copy = form.variants.filter((_, j) => j !== i); setForm({ ...form, variants: copy }) }}
                        className="absolute top-2 right-2 text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded-lg hover:bg-red-100">Eliminar</button>
                    </div>
                  ))}
                </div>

                {preview.warnings.length > 0 && (
                  <div className="text-xs bg-amber-50 text-amber-800 rounded-xl p-3 space-y-1">
                    {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Guardar (nueva versión)'}
                  </button>
                  <button onClick={() => setEditing(null)} className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog">Cancelar</button>
                </div>
              </div>

              {/* Variables + preview */}
              <div className="p-6 space-y-5 bg-fog/30">
                <div>
                  <h3 className="text-sm font-semibold text-ink mb-2">Variables (clic para insertar)</h3>
                  <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                    {varsForType(editing.type).map((v) => (
                      <button key={v.name} onClick={() => insertVariable(v.name)} title={`${v.description} · ej: ${v.example}`}
                        className="block w-full text-left text-xs font-mono px-2 py-1 rounded-lg bg-white border border-silver-mist hover:border-azure">
                        {`{{${v.name}}}`} {v.required && <span className="text-red-500">*</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink mb-2">Vista previa (render real, datos de ejemplo)</h3>
                  <div className="bg-[#e5ddd5] rounded-xl p-3">
                    <div className="bg-[#dcf8c6] rounded-lg p-3 text-[13px] text-ink whitespace-pre-wrap shadow-sm">
                      {renderWhatsapp(preview.rendered || form.body)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* VERSIONS */}
      {versionsFor && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setVersionsFor(null)}>
          <div className="bg-white rounded-card p-6 w-full max-w-lg max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink mb-4">Versiones — {versionsFor.title}</h2>
            <div className="space-y-3">
              {versions.map((v) => (
                <div key={v.id} className="border border-silver-mist rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-ink">v{v.version} {v.isActive && <span className="text-[11px] text-green-700">(activa)</span>}</span>
                    <span className="text-[11px] text-graphite">{new Date(v.createdAt).toLocaleString('es-MX')}</span>
                  </div>
                  <p className="text-xs text-graphite whitespace-pre-line line-clamp-4 font-mono">{v.body}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setVersionsFor(null)} className="mt-4 text-sm text-graphite px-5 py-2 rounded-pill border border-silver-mist hover:bg-fog">Cerrar</button>
          </div>
        </div>
        </Portal>
      )}
    </div>
  )
}

/** Render ligero de *negritas* y _cursivas_ SOLO para la vista previa visual. */
function renderWhatsapp(text: string): React.ReactNode {
  const parts = text.split(/(\*[^*]+\*|_[^_]+_)/g)
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>
    return <span key={i}>{p}</span>
  })
}
