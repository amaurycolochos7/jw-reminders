'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import Portal from '@/components/Portal'

interface Batch { id: string; type: string; periodLabel: string | null; status: string; createdAt: string; approvedAt: string | null; messages: number; deliveries: number; edited: number }
interface Msg { deliveryId: string; publisherName: string; phone: string | null; reminderType: string; status: string; manuallyEdited: boolean; renderedMessage: string | null }
interface Schedule { id: string; name: string }

const TYPES = [
  { v: 'INITIAL_NOTICE', l: 'Aviso inicial (mensual)' },
  { v: 'SEVEN_DAYS_BEFORE', l: 'Recordatorio 7 días' },
  { v: 'THREE_DAYS_BEFORE', l: 'Recordatorio 3 días' },
  { v: 'ONE_DAY_BEFORE', l: 'Recordatorio 1 día' },
]

export default function MensajesPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selected, setSelected] = useState<Batch | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [genType, setGenType] = useState('INITIAL_NOTICE')
  const [genSchedule, setGenSchedule] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Msg | null>(null)
  const [editText, setEditText] = useState('')

  const loadBatches = useCallback(async () => {
    const res = await api('/api/automation-center/batches')
    if (res.ok) setBatches(await res.json())
  }, [])

  useEffect(() => {
    loadBatches()
    api('/api/monthly-schedules').then(async (r) => { if (r.ok) { const d = await r.json(); setSchedules(Array.isArray(d) ? d : (d.items ?? [])) } })
  }, [loadBatches])

  async function openBatch(b: Batch) {
    setSelected(b)
    const res = await api(`/api/automation-center/batches/${b.id}`)
    if (res.ok) { const d = await res.json(); setMessages(d.messages) }
  }

  async function generate() {
    setBusy('gen'); setNotice(null)
    try {
      const res = await api('/api/automation-center/batches/generate', {
        method: 'POST',
        body: JSON.stringify({ reminderType: genType, monthlyScheduleId: genSchedule || undefined, periodLabel: schedules.find(s => s.id === genSchedule)?.name }),
      })
      const d = await res.json()
      setNotice(d.batchId ? `Batch generado: ${d.groups} mensaje(s), ${d.frozen} entregas congeladas.` : 'No había entregas pendientes para congelar en ese alcance.')
      await loadBatches()
    } finally { setBusy('') }
  }

  async function regenerate(m: Msg) {
    setBusy(m.deliveryId)
    try { await api(`/api/automation-center/deliveries/${m.deliveryId}/regenerate`, { method: 'POST' }); if (selected) await openBatch(selected) }
    finally { setBusy('') }
  }

  async function saveEdit() {
    if (!editing) return
    setBusy('edit')
    try {
      await api(`/api/automation-center/deliveries/${editing.deliveryId}/edit-final`, { method: 'POST', body: JSON.stringify({ text: editText }) })
      setEditing(null)
      if (selected) await openBatch(selected)
    } finally { setBusy('') }
  }

  async function approve() {
    if (!selected) return
    setBusy('approve'); setNotice(null)
    try {
      const res = await api(`/api/automation-center/batches/${selected.id}/approve`, { method: 'POST' })
      const d = await res.json()
      setNotice(res.ok ? `Batch aprobado: ${d.approved} entregas → READY (listas para enviar).` : `No se pudo aprobar: ${d.error}`)
      await loadBatches(); await openBatch(selected)
    } finally { setBusy('') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Mensajes generados / Revisión</h1>
        <p className="text-sm text-graphite mt-1">Genera, revisa el mensaje final por persona, edita o regenera, y aprueba el batch antes de enviar.</p>
      </div>

      {/* Generar */}
      <div className="bg-white rounded-card p-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-graphite mb-1">Tipo</label>
          <select value={genType} onChange={(e) => setGenType(e.target.value)} className="px-3 py-2 border border-silver-mist rounded-xl text-sm">
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-graphite mb-1">Programa mensual</label>
          <select value={genSchedule} onChange={(e) => setGenSchedule(e.target.value)} className="px-3 py-2 border border-silver-mist rounded-xl text-sm min-w-[200px]">
            <option value="">(todos los pendientes)</option>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button onClick={generate} disabled={busy === 'gen'} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 disabled:opacity-50">
          {busy === 'gen' ? 'Generando...' : 'Generar y congelar'}
        </button>
      </div>

      {notice && <div className="text-sm bg-azure/5 text-ink rounded-xl p-3">{notice}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de batches */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Batches</h2>
          {batches.map((b) => (
            <button key={b.id} onClick={() => openBatch(b)} className={`block w-full text-left bg-white rounded-xl p-4 border ${selected?.id === b.id ? 'border-azure' : 'border-transparent'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{b.periodLabel || b.type}</span>
                <StatusBadge status={b.status} />
              </div>
              <div className="text-[11px] text-graphite mt-1">{b.messages} mensaje(s) · {b.edited} editado(s) · {new Date(b.createdAt).toLocaleDateString('es-MX')}</div>
            </button>
          ))}
          {batches.length === 0 && <p className="text-sm text-graphite">Aún no hay batches. Genera uno arriba.</p>}
        </div>

        {/* Mensajes del batch */}
        <div className="lg:col-span-2 space-y-3">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Mensajes — {selected.periodLabel || selected.type}</h2>
                <button onClick={approve} disabled={busy === 'approve' || selected.status === 'APPROVED'} className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-pill hover:opacity-90 disabled:opacity-40">
                  {selected.status === 'APPROVED' ? 'Aprobado' : busy === 'approve' ? 'Aprobando...' : 'Aprobar batch'}
                </button>
              </div>
              {messages.map((m) => (
                <div key={m.deliveryId} className="bg-white rounded-card p-5">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{m.publisherName}</span>
                      <span className="text-[11px] text-graphite">{m.phone}</span>
                      {m.manuallyEdited && <span className="text-[11px] font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">editado manual</span>}
                      <StatusBadge status={m.status} />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { setEditing(m); setEditText(m.renderedMessage || '') }} className="text-azure text-sm font-medium hover:opacity-70">Editar</button>
                      <button onClick={() => regenerate(m)} disabled={busy === m.deliveryId} className="text-graphite text-sm hover:text-ink">Regenerar</button>
                    </div>
                  </div>
                  <div className="bg-[#e5ddd5] rounded-xl p-3">
                    <div className="bg-[#dcf8c6] rounded-lg p-3 text-[13px] text-ink whitespace-pre-wrap shadow-sm">{renderWhatsapp(m.renderedMessage || '(sin snapshot)')}</div>
                  </div>
                </div>
              ))}
            </>
          ) : <p className="text-sm text-graphite">Selecciona un batch para revisar sus mensajes.</p>}
        </div>
      </div>

      {/* Editar mensaje final */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-card p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink mb-1">Editar mensaje final — {editing.publisherName}</h2>
            <p className="text-xs text-graphite mb-4">Se enviará EXACTAMENTE este texto. Quedará marcado como editado manualmente.</p>
            <textarea rows={12} value={editText} onChange={(e) => setEditText(e.target.value)} className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm font-mono resize-y" />
            <div className="flex gap-3 mt-4">
              <button onClick={saveEdit} disabled={busy === 'edit'} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 disabled:opacity-50">Guardar mensaje final</button>
              <button onClick={() => setEditing(null)} className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'text-amber-700 bg-amber-100', READY: 'text-blue-700 bg-blue-100', APPROVED: 'text-green-700 bg-green-100',
    SENT: 'text-green-700 bg-green-100', PAUSED: 'text-orange-700 bg-orange-100', SKIPPED: 'text-graphite bg-silver-mist',
  }
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${map[status] || 'text-graphite bg-silver-mist'}`}>{status}</span>
}

function renderWhatsapp(text: string): React.ReactNode {
  const parts = text.split(/(\*[^*]+\*|_[^_]+_)/g)
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>
    return <span key={i}>{p}</span>
  })
}
