'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Delivery {
  id: string
  assignmentNumber: number | null
  assignmentTitle: string | null
  reminderType: string
  recipientRole: string
  status: string
  scheduledAt: string
  localDate: string
  localTime: string
  overdue: boolean
  attemptCount: number
  maxAttempts: number
  errorMessage: string | null
  cancelReason: string | null
  hasCustomMessage: boolean
  publisherName: string
  canEditMessage: boolean
  canSendNow: boolean
  canReschedule: boolean
  canRetry: boolean
  canCancel: boolean
}

interface Summary { total: number; pending: number; sent: number; cancelled: number; failed: number; skipped: number }

interface Props { weekId: string }

const TYPE_LABELS: Record<string, string> = {
  INITIAL_NOTICE: 'Aviso inicial', SEVEN_DAYS_BEFORE: '7 dias antes', THREE_DAYS_BEFORE: '3 dias antes',
  ONE_DAY_BEFORE: '1 dia antes', SAME_DAY: 'Mismo dia', CHANGE_NOTICE: 'Aviso de cambio', CANCELLATION_NOTICE: 'Aviso de cancelacion',
}
const TYPE_ORDER: Record<string, number> = {
  INITIAL_NOTICE: 0, SEVEN_DAYS_BEFORE: 1, THREE_DAYS_BEFORE: 2, ONE_DAY_BEFORE: 3, SAME_DAY: 4, CHANGE_NOTICE: 5, CANCELLATION_NOTICE: 6,
}
const STATUS_MAP: Record<string, { label: string; classes: string }> = {
  PENDING: { label: 'Pendiente', classes: 'bg-amber-50 text-amber-700' },
  QUEUED: { label: 'En cola', classes: 'bg-amber-50 text-amber-700' },
  SENDING: { label: 'Enviando', classes: 'bg-fog text-azure' },
  SENT: { label: 'Enviado', classes: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Fallido', classes: 'bg-red-50 text-red-700' },
  DEAD: { label: 'Agotado', classes: 'bg-red-50 text-red-700' },
  CANCELLED: { label: 'Cancelado', classes: 'bg-red-50 text-red-600' },
  SKIPPED: { label: 'Omitido', classes: 'bg-fog text-graphite' },
}

function fmt(iso: string): string {
  const [datePart, timePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const hm = (timePart || '').slice(0, 5)
  return `${d} ${months[m - 1]} ${y} ${hm}`
}

export default function WeekAutomations({ weekId }: Props) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editing, setEditing] = useState<Delivery | null>(null)
  const [rescheduling, setRescheduling] = useState<Delivery | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/automation-center/deliveries/by-week/${weekId}`)
      if (res.ok) {
        const data = await res.json()
        setDeliveries(data.deliveries || [])
        setSummary(data.summary || null)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [weekId])

  useEffect(() => { load() }, [load])

  function flash(type: 'success' | 'error', text: string) {
    setNotice({ type, text })
    setTimeout(() => setNotice(null), 4000)
  }

  async function action(id: string, path: string, okMsg: string, body?: any) {
    setBusyId(id)
    try {
      const res = await api(`/api/automation-center/deliveries/${id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { flash('success', okMsg); await load() }
      else flash('error', data.error || 'No se pudo completar la accion')
    } catch { flash('error', 'Error de conexion') } finally { setBusyId(null) }
  }

  // Group reminders by assignment (the week's parts) so the list maps to the
  // week's assignments instead of one long flat list of every reminder.
  const assignmentGroups: { key: string; number: number | null; title: string; items: Delivery[] }[] = (() => {
    const map = new Map<string, { key: string; number: number | null; title: string; items: Delivery[] }>()
    for (const d of deliveries) {
      const key = `${d.assignmentNumber ?? 'z'}-${d.assignmentTitle ?? ''}`
      if (!map.has(key)) map.set(key, { key, number: d.assignmentNumber, title: d.assignmentTitle || 'Asignacion', items: [] })
      map.get(key)!.items.push(d)
    }
    const groups = Array.from(map.values())
    for (const g of groups) {
      g.items.sort((a, b) => {
        if (a.recipientRole !== b.recipientRole) return a.recipientRole === 'ASSIGNED' ? -1 : 1
        return (TYPE_ORDER[a.reminderType] ?? 9) - (TYPE_ORDER[b.reminderType] ?? 9)
      })
    }
    return groups.sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
  })()

  return (
    <div className="bg-white rounded-card p-5 sm:p-7">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-ink tracking-tight">Automatizaciones de esta semana</h2>
        <button onClick={load} className="text-sm text-azure hover:opacity-80">Actualizar</button>
      </div>
      <p className="text-xs text-graphite mb-2">
        Solo se muestran los recordatorios de esta semana{summary ? `, agrupados por asignacion (${assignmentGroups.length} ${assignmentGroups.length === 1 ? 'asignacion' : 'asignaciones'}, ${summary.total} recordatorios)` : ''}.
      </p>
      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4">
        Si cambias la asignacion, los recordatorios se regeneraran y cualquier mensaje editado sera reemplazado.
      </p>

      {summary && (
        <div className="grid grid-cols-4 gap-2 mb-5 text-center">
          <div className="rounded-xl bg-amber-50 py-2"><div className="text-lg font-semibold text-amber-700">{summary.pending}</div><div className="text-xs text-graphite">Pendientes</div></div>
          <div className="rounded-xl bg-emerald-50 py-2"><div className="text-lg font-semibold text-emerald-700">{summary.sent}</div><div className="text-xs text-graphite">Enviadas</div></div>
          <div className="rounded-xl bg-red-50 py-2"><div className="text-lg font-semibold text-red-700">{summary.failed}</div><div className="text-xs text-graphite">Fallidas</div></div>
          <div className="rounded-xl bg-fog py-2"><div className="text-lg font-semibold text-graphite">{summary.cancelled}</div><div className="text-xs text-graphite">Canceladas</div></div>
        </div>
      )}

      {notice && (
        <p className={`text-sm mb-3 p-2.5 rounded-xl ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{notice.text}</p>
      )}

      {loading ? (
        <div className="space-y-2 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-silver-mist/40 rounded-xl" />)}</div>
      ) : deliveries.length === 0 ? (
        <p className="text-sm text-graphite py-6 text-center">No hay automatizaciones en esta semana. Genera recordatorios desde las asignaciones.</p>
      ) : (
        <div className="space-y-5">
          {assignmentGroups.map((g) => (
            <div key={g.key}>
              <h3 className="text-sm font-semibold text-ink mb-2">{g.number ? `${g.number}. ` : ''}{g.title} <span className="text-graphite font-normal">({g.items.length})</span></h3>
              <div className="space-y-2">
                {g.items.map((d) => {
                  const st = STATUS_MAP[d.status] || STATUS_MAP.PENDING
                  return (
                    <div key={d.id} className="border border-silver-mist/70 rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm text-ink">
                            {d.publisherName} · {TYPE_LABELS[d.reminderType] || d.reminderType}
                            {d.recipientRole === 'COMPANION' && <span className="text-xs text-graphite"> (acompanante)</span>}
                          </p>
                          <p className="text-xs text-graphite mt-0.5">
                            {fmt(d.scheduledAt)}
                            {d.overdue && <span className="text-red-600"> · vencido</span>}
                          </p>
                          {d.errorMessage && <p className="text-xs text-red-600 mt-1">Motivo: {d.errorMessage}</p>}
                          {d.cancelReason && d.status === 'CANCELLED' && <p className="text-xs text-graphite mt-1">Motivo: {d.cancelReason}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {d.hasCustomMessage && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-azure/10 text-azure">Mensaje personalizado</span>}
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${st.classes}`}>{st.label}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2.5">
                        <button onClick={() => setEditing(d)} className="text-xs px-2.5 py-1 rounded-lg border border-silver-mist hover:bg-fog">Ver mensaje</button>
                        {d.canEditMessage && <button onClick={() => setEditing(d)} className="text-xs px-2.5 py-1 rounded-lg border border-silver-mist hover:bg-fog">Editar mensaje</button>}
                        {d.canSendNow && <button disabled={busyId === d.id} onClick={() => action(d.id, 'send-now', 'Programado para envio inmediato')} className="text-xs px-2.5 py-1 rounded-lg border border-azure/40 text-azure hover:bg-azure/5 disabled:opacity-50">Enviar ahora</button>}
                        {d.canReschedule && <button onClick={() => setRescheduling(d)} className="text-xs px-2.5 py-1 rounded-lg border border-silver-mist hover:bg-fog">Reprogramar</button>}
                        {d.canRetry && <button disabled={busyId === d.id} onClick={() => action(d.id, 'retry', 'Reintento programado')} className="text-xs px-2.5 py-1 rounded-lg border border-silver-mist hover:bg-fog disabled:opacity-50">Reintentar</button>}
                        {d.canCancel && <button disabled={busyId === d.id} onClick={() => action(d.id, 'cancel', 'Recordatorio cancelado')} className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">Cancelar</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <MessageModal
          delivery={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); flash('success', 'Mensaje actualizado'); load() }}
          onError={(m) => flash('error', m)}
        />
      )}

      {rescheduling && (
        <RescheduleModal
          delivery={rescheduling}
          onClose={() => setRescheduling(null)}
          onSaved={() => { setRescheduling(null); flash('success', 'Recordatorio reprogramado'); load() }}
          onError={(m) => flash('error', m)}
        />
      )}
    </div>
  )
}

// ─── Modal: ver / editar mensaje ─────────────────────────
function MessageModal({ delivery, onClose, onSaved, onError }: { delivery: Delivery; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templateMessage, setTemplateMessage] = useState('')
  const [text, setText] = useState('')
  const [hasCustom, setHasCustom] = useState(false)
  const canEdit = delivery.canEditMessage

  useEffect(() => {
    async function load() {
      try {
        const res = await api(`/api/automation-center/deliveries/${delivery.id}/preview`)
        if (res.ok) {
          const data = await res.json()
          setTemplateMessage(data.templateMessage || '')
          setText(data.effectiveMessage || data.templateMessage || '')
          setHasCustom(!!data.hasCustomMessage)
        }
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    load()
  }, [delivery.id])

  async function save(custom: string | null) {
    setSaving(true)
    try {
      const res = await api(`/api/automation-center/deliveries/${delivery.id}/message`, { method: 'POST', body: JSON.stringify({ customMessage: custom }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) onSaved()
      else onError(data.error || 'No se pudo guardar el mensaje')
    } catch { onError('Error de conexion') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-card p-6 w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-ink mb-1">{canEdit ? 'Editar mensaje' : 'Ver mensaje'}</h2>
        <p className="text-sm text-graphite mb-4">{delivery.publisherName} · {TYPE_LABELS[delivery.reminderType] || delivery.reminderType}</p>

        {loading ? (
          <div className="h-32 bg-silver-mist/40 rounded-xl animate-pulse" />
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              readOnly={!canEdit}
              className={`w-full px-4 py-3 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 ${!canEdit ? 'bg-fog text-graphite' : ''}`}
            />
            {!canEdit && <p className="text-xs text-graphite mt-2">Este recordatorio no se puede editar en su estado actual ({delivery.status}).</p>}
            {canEdit && (
              <div className="flex flex-wrap gap-2 mt-4">
                <button disabled={saving} onClick={() => save(text)} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar mensaje'}
                </button>
                {hasCustom && (
                  <button disabled={saving} onClick={() => save(null)} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog disabled:opacity-50">
                    Restaurar plantilla
                  </button>
                )}
                <button onClick={onClose} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog">Cerrar</button>
              </div>
            )}
            {!canEdit && <div className="mt-4"><button onClick={onClose} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog">Cerrar</button></div>}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Modal: reprogramar ──────────────────────────────────
function RescheduleModal({ delivery, onClose, onSaved, onError }: { delivery: Delivery; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [value, setValue] = useState(delivery.scheduledAt.slice(0, 16))
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!value) { onError('Selecciona fecha y hora'); return }
    setSaving(true)
    try {
      const iso = new Date(value).toISOString()
      const res = await api(`/api/automation-center/deliveries/${delivery.id}/reschedule`, { method: 'POST', body: JSON.stringify({ scheduledAt: iso }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) onSaved()
      else onError(data.error || 'No se pudo reprogramar')
    } catch { onError('Error de conexion') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-ink mb-1">Reprogramar</h2>
        <p className="text-sm text-graphite mb-4">{delivery.publisherName} · {TYPE_LABELS[delivery.reminderType] || delivery.reminderType}</p>
        <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
        <div className="flex gap-2 mt-4">
          <button disabled={saving} onClick={save} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 disabled:opacity-50">{saving ? 'Guardando...' : 'Reprogramar'}</button>
          <button onClick={onClose} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog">Cancelar</button>
        </div>
      </div>
    </div>
  )
}
