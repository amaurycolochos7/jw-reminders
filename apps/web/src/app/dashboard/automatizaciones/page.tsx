'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import { StatusDot } from '@/components/StatusDot'
import { Badge } from '@/components/Badge'

// ─── Types ───────────────────────────────────────────────
interface WorkerPhase {
  phase: 'IDLE' | 'TYPING' | 'SENDING' | 'WAITING_ACK' | 'COOLDOWN' | 'PAUSED' | 'DONE'
  publisherName: string | null
  detail: string | null
  updatedAt: string | null
  cooldownSeconds?: number
  sentCount?: number
  totalCount?: number
  nextPublisher?: string
}

interface OpsStatus {
  serverNow: string
  timezone: string
  whatsapp: { status: string; connectedNumber: string | null; deviceName: string | null; error: string | null }
  worker: { status: string; lastTickAt: string | null; cron: string }
  workerPhase: WorkerPhase | null
  queue: { paused: boolean; pauseReason: string | null; pauseSource: string | null; pausedAt: string | null; nextSendAt: string | null; secondsUntilNextSend: number | null; nextPublisherName: string | null; nextPublisherPhone: string | null }
  counts: { whatsappMessagesToday: number; pendingMessages: number; sentMessages: number; failedMessages: number; uncertainMessages: number; estimatedWhatsappGroups: number }
  lastEvent: { type: string | null; ack: number | null; phone: string | null; time: string | null; error: string | null }
}

interface SendGroup {
  groupKey: string
  publisherName: string
  phone: string | null
  reminderType: string
  programName: string | null
  assignmentCount: number
  assignments: { id: string; title: string; role: string }[]
  status: string
  scheduledAt: string
  localTime: string
  localDate: string
  deliveryIds: string[]
}

// ─── Helpers ─────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  INITIAL_NOTICE: 'Aviso inicial', SEVEN_DAYS_BEFORE: '7d', THREE_DAYS_BEFORE: '3d',
  ONE_DAY_BEFORE: '1d', CHANGE_NOTICE: 'Cambio', CANCELLATION_NOTICE: 'Cancelación',
}

function maskPhone(phone: string | null): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length < 6) return '***'
  return `***${d.slice(-4)}`
}

function fmtTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── Page ────────────────────────────────────────────────
export default function AutomatizacionesPage() {
  const [ops, setOps] = useState<OpsStatus | null>(null)
  const [groups, setGroups] = useState<SendGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function notify(type: 'success' | 'error', text: string) {
    setToast({ type, text }); setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    try {
      const [opsRes, groupsRes] = await Promise.all([
        api('/api/automation-center/operations-status'),
        api('/api/automation-center/send-groups'),
      ])
      if (opsRes.ok) {
        const d = await opsRes.json()
        setOps(d)
        // Calcular cooldown restante desde updatedAt del worker
        if (d.workerPhase?.phase === 'COOLDOWN' && d.workerPhase.cooldownSeconds && d.workerPhase.updatedAt) {
          const elapsed = Math.round((Date.now() - new Date(d.workerPhase.updatedAt).getTime()) / 1000)
          setCooldownRemaining(Math.max(0, d.workerPhase.cooldownSeconds - elapsed))
        } else {
          setCooldownRemaining(0)
        }
      }
      if (groupsRes.ok) { const d = await groupsRes.json(); setGroups(d.groups || []) }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  // Refresh rápido: cada 5 segundos para que el estado se actualice sin quedar "pegado"
  useEffect(() => {
    const i = setInterval(() => { if (document.visibilityState === 'visible') load() }, 5000)
    return () => clearInterval(i)
  }, [load])

  // Cooldown ticker local (baja cada segundo)
  useEffect(() => {
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    if (cooldownRemaining <= 0) return
    cooldownRef.current = setInterval(() => setCooldownRemaining((c) => c > 0 ? c - 1 : 0), 1000)
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, [cooldownRemaining])

  async function togglePause() {
    setActionLoading('pause')
    try {
      const newValue = ops?.queue.paused ? 'false' : 'true'
      const res = await api('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'SENDS_PAUSED', value: newValue }) })
      if (res.ok) { notify('success', newValue === 'true' ? 'Cola pausada' : 'Cola reanudada'); await load() }
      else notify('error', 'No se pudo cambiar el estado')
    } finally { setActionLoading('') }
  }

  async function cancelAll() {
    if (!confirm('¿Cancelar TODOS los envíos pendientes? Podrás volver a generarlos desde el programa.')) return
    setActionLoading('cancel')
    try {
      const res = await api('/api/automation-center/cancel-all-pending', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        notify('success', `${data.cancelled} envíos cancelados`)
        await load()
      } else notify('error', 'No se pudieron cancelar')
    } finally { setActionLoading('') }
  }

  if (loading) return (
    <div className="mx-auto w-full max-w-5xl space-y-4 animate-pulse">
      <div className="h-14 rounded-card bg-white" />
      <div className="h-32 rounded-card bg-white" />
      <div className="h-64 rounded-card bg-white" />
    </div>
  )

  if (!ops) return (
    <div className="bg-white rounded-card p-10 text-center">
      <p className="text-sm text-graphite">No se pudo cargar el estado operativo</p>
      <button onClick={load} className="mt-4 text-sm font-medium text-azure">Reintentar</button>
    </div>
  )

  const waReady = ops.whatsapp.status === 'READY'
  const queueActive = !ops.queue.paused && waReady

  // Contar MENSAJES (groups = 1 mensaje WhatsApp por persona), NO asignaciones
  const sentMsgs = groups.filter((g) => g.status === 'SENT').length
  const pendingMsgs = groups.filter((g) => ['PENDING', 'READY', 'QUEUED', 'SENDING'].includes(g.status)).length
  const failedMsgs = groups.filter((g) => ['FAILED', 'DEAD'].includes(g.status)).length
  const totalMsgs = groups.length
  const sentPct = totalMsgs > 0 ? Math.round((sentMsgs / totalMsgs) * 100) : 0

  // Fase real del worker (detectar si está "stale" — más de 90s sin actualizar = ya terminó esa fase)
  const wp = ops.workerPhase
  const phaseAge = wp?.updatedAt ? Math.round((Date.now() - new Date(wp.updatedAt).getTime()) / 1000) : 9999
  const isPhaseStale = phaseAge > 90 // si tiene más de 90s sin cambiar, está desactualizado
  const activePhase = wp && !isPhaseStale && wp.phase !== 'IDLE' && wp.phase !== 'DONE' ? wp : null

  // Número real de mensajes del worker (no de la lista de grupos que puede estar desincronizada)
  const workerSent = activePhase?.sentCount ?? sentMsgs
  const workerTotal = activePhase?.totalCount ?? totalMsgs

  // Tiempos estimados
  const AVG_PER_MSG_S = 190 // ~3.2 min (typing + send + cooldown)
  const LONG_COOLDOWN_S = 300
  const LONG_COOLDOWN_EVERY = 5
  const longPauses = Math.floor(pendingMsgs / LONG_COOLDOWN_EVERY)
  const totalEstS = (pendingMsgs * AVG_PER_MSG_S) + (longPauses * LONG_COOLDOWN_S)
  const estHours = Math.floor(totalEstS / 3600)
  const estMins = Math.floor((totalEstS % 3600) / 60)
  const finishTime = new Date(Date.now() + totalEstS * 1000)
  const finishStr = finishTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' })
  const nowStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' })

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {toast.text}
        </div>
      )}

      {/* ━━━ HEADER ━━━ */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink tracking-tight">Automatizaciones</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-graphite mr-2">
            <StatusDot color={waReady ? 'green' : 'red'} pulse={waReady} />
            <span>WA</span>
            <StatusDot color={queueActive ? 'green' : ops.queue.paused ? 'yellow' : 'red'} />
            <span>{ops.queue.paused ? 'Pausa' : 'Activo'}</span>
          </div>
          <button onClick={load} className="text-[11px] text-graphite px-2 py-1.5 rounded-lg hover:bg-fog">↻</button>
          <button onClick={cancelAll} disabled={actionLoading === 'cancel'}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50">
            ✕ Cancelar envíos
          </button>
          <button onClick={togglePause} disabled={actionLoading === 'pause'}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${ops.queue.paused ? 'bg-emerald-500 text-white' : 'bg-amber-50 text-amber-700'}`}>
            {ops.queue.paused ? '▶ Reanudar' : '⏸ Pausar'}
          </button>
        </div>
      </div>

      {/* ━━━ ESTADO EN TIEMPO REAL + CRONÓMETRO ━━━ */}
      <div className="bg-white rounded-card p-4 space-y-3">

        {/* Estado actual */}
        {activePhase && (
          <div className="flex items-center gap-3">
            {activePhase.phase === 'TYPING' && (
              <>
                <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-azure opacity-75 animate-ping" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-azure" /></span>
                <span className="text-sm font-medium text-ink">Escribiendo a {activePhase.publisherName}…</span>
              </>
            )}
            {activePhase.phase === 'SENDING' && (
              <>
                <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
                <span className="text-sm font-medium text-ink">Enviando a {activePhase.publisherName}…</span>
              </>
            )}
            {activePhase.phase === 'WAITING_ACK' && (
              <>
                <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" /></span>
                <span className="text-sm font-medium text-ink">Confirmando entrega a {activePhase.publisherName}…</span>
              </>
            )}
            {activePhase.phase === 'COOLDOWN' && (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <span className="text-sm text-ink">
                  Enviado ✓ — Esperando para siguiente mensaje
                </span>
              </>
            )}
            {activePhase.phase === 'PAUSED' && (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="text-sm font-medium text-red-700">Detenido: {activePhase.detail}</span>
              </>
            )}
            <span className="ml-auto text-[11px] text-graphite">
              Mensaje {workerSent + 1} de {workerTotal}
            </span>
          </div>
        )}

        {/* Cronómetro del cooldown + próximo destinatario */}
        {cooldownRemaining > 0 && (
          <div className="flex items-center gap-4 bg-fog rounded-xl px-4 py-3">
            <div className="text-center min-w-[70px]">
              <p className="text-2xl font-bold text-ink font-mono">{fmtTimer(cooldownRemaining)}</p>
              <p className="text-[10px] text-graphite">para siguiente</p>
            </div>
            <div className="flex-1">
              {activePhase?.nextPublisher && (
                <p className="text-sm text-ink">
                  Próximo → <span className="font-medium">{activePhase.nextPublisher}</span>
                </p>
              )}
              <p className="text-[10px] text-graphite">Pausa de seguridad entre mensajes</p>
            </div>
          </div>
        )}

        {/* Barra de progreso — MENSAJES (no asignaciones) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-ink">{sentMsgs} de {totalMsgs} mensajes enviados</span>
            <span className="text-xs text-graphite">{sentPct}%</span>
          </div>
          <div className="h-2 bg-fog rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${sentPct}%` }} />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-graphite">
            <span className="text-emerald-600 font-medium">{sentMsgs} ✓ enviados</span>
            <span>{pendingMsgs} por enviar</span>
            {failedMsgs > 0 && <span className="text-red-600">{failedMsgs} fallidos</span>}
          </div>
        </div>

        {/* Tiempos estimados */}
        {pendingMsgs > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-silver-mist/50 text-center">
            <div>
              <p className="text-base font-bold text-ink">{estHours > 0 ? `${estHours}h ${estMins}m` : `${estMins} min`}</p>
              <p className="text-[10px] text-graphite">Duración estimada</p>
            </div>
            <div>
              <p className="text-base font-bold text-ink">{nowStr} → {finishStr}</p>
              <p className="text-[10px] text-graphite">Hora Mex Central</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-graphite">{pendingMsgs} × ~3 min</p>
              <p className="text-[10px] text-graphite">Por mensaje</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-graphite">{longPauses} × 5 min</p>
              <p className="text-[10px] text-graphite">Pausas largas</p>
            </div>
          </div>
        )}

        {/* Cola pausada */}
        {ops.queue.paused && (
          <div className="bg-red-50 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-red-700">Cola pausada</p>
            <p className="text-xs text-red-600">{ops.queue.pauseReason || 'Pausada manualmente'}</p>
          </div>
        )}
      </div>

      {/* ━━━ LISTA DE DESTINATARIOS ━━━ */}
      <div className="bg-white rounded-card overflow-hidden">
        <div className="px-4 py-3 border-b border-silver-mist/50">
          <h2 className="text-sm font-semibold text-ink">Destinatarios ({totalMsgs} mensajes)</h2>
        </div>
        {groups.length === 0 ? (
          <div className="p-6 text-center text-sm text-graphite">Sin mensajes programados</div>
        ) : (
          <div className="divide-y divide-silver-mist/40 max-h-[420px] overflow-y-auto">
            {groups.map((g, i) => (
              <PublisherRow key={g.groupKey + i} group={g} index={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Row por publicador (1 row = 1 mensaje WhatsApp) ─────
function PublisherRow({ group: g, index }: { group: SendGroup; index: number }) {
  const isSent = g.status === 'SENT'
  const isFailed = g.status === 'FAILED' || g.status === 'DEAD'

  return (
    <div className={`px-4 py-2.5 flex items-center gap-3 ${isSent ? 'opacity-50' : ''}`}>
      <span className="w-5 text-[11px] text-graphite text-right font-mono">{index}</span>
      <div className="w-5 flex justify-center">
        {isSent && <span className="text-emerald-500 text-sm">✓</span>}
        {isFailed && <span className="text-red-500 text-sm">✗</span>}
        {!isSent && !isFailed && <span className="w-2 h-2 rounded-full bg-slate-200" />}
      </div>
      <span className={`text-sm flex-1 truncate ${isSent ? 'text-graphite line-through' : isFailed ? 'text-red-700' : 'text-ink font-medium'}`}>
        {g.publisherName}
      </span>
      <span className="text-[10px] text-graphite hidden sm:inline">
        {g.assignmentCount > 1 ? `${g.assignmentCount} asignaciones` : TYPE_LABELS[g.reminderType] || g.reminderType}
      </span>
      {isFailed && <span className="text-[10px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Fallido</span>}
      {isSent && <span className="text-[10px] text-emerald-600">{g.localTime}</span>}
      {!isSent && !isFailed && <span className="text-[10px] text-graphite">{g.localTime}</span>}
    </div>
  )
}
