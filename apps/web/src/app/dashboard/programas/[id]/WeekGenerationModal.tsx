'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { StatusDot } from '@/components'
import { importStatusMeta } from '@/lib/week-program'

interface WeekProgress {
  id: string
  weekStartDateLocal: string | null
  meetingDateLocal: string | null
  importStatus: string
  itemCount: number
  importError: string | null
}

interface Progress {
  total: number
  ready: number
  needsReview: number
  failed: number
  importing: number
  empty: number
  done: boolean
  weeks: WeekProgress[]
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function shortDate(v: string | null): string {
  if (!v) return '—'
  const [, m, d] = v.split('T')[0].split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

interface Props {
  programId: string
  programName: string
  meetingDayOfWeek: number
  meetingTime: string
  onClose: (reloaded: boolean) => void
}

/**
 * Pantalla de generación de semanas: crea las semanas y muestra en vivo el
 * progreso del scraping de WOL (importación del programa de Vida y Ministerio).
 * Éxito → cierra automáticamente. Error → detalla qué semana falló y por qué,
 * con opción de reintentar.
 */
export default function WeekGenerationModal({ programId, programName, meetingDayOfWeek, meetingTime, onClose }: Props) {
  const [phase, setPhase] = useState<'starting' | 'importing' | 'done' | 'startError'>('starting')
  const [created, setCreated] = useState<number | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [startError, setStartError] = useState('')
  const [retrying, setRetrying] = useState<string | null>(null)
  const mounted = useRef(true)
  const started = useRef(false)

  const poll = useCallback(async () => {
    try {
      const res = await api(`/api/monthly-schedules/${programId}/weeks-progress`)
      if (!res.ok) throw new Error('progress')
      const data: Progress = await res.json()
      if (!mounted.current) return
      setProgress(data)
      if (data.done) {
        setPhase('done')
      } else {
        setTimeout(() => { if (mounted.current) poll() }, 2000)
      }
    } catch {
      if (mounted.current) setTimeout(() => { if (mounted.current) poll() }, 3000)
    }
  }, [programId])

  useEffect(() => {
    mounted.current = true
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        const res = await api(`/api/monthly-schedules/${programId}/generate-weeks`, {
          method: 'POST',
          body: JSON.stringify({ meetingDayOfWeek, meetingTime }),
        })
        const data = await res.json().catch(() => ({}))
        if (!mounted.current) return
        if (!res.ok) { setStartError(data.error || 'No se pudieron generar las semanas'); setPhase('startError'); return }
        setCreated(data.created ?? 0)
        setPhase('importing')
        poll()
      } catch {
        if (mounted.current) { setStartError('Error de conexión'); setPhase('startError') }
      }
    })()
    return () => { mounted.current = false }
  }, [programId, meetingDayOfWeek, meetingTime, poll])

  // Éxito sin errores → cerrar solo.
  useEffect(() => {
    if (phase === 'done' && progress && progress.failed === 0) {
      const t = setTimeout(() => onClose(true), 1800)
      return () => clearTimeout(t)
    }
  }, [phase, progress, onClose])

  async function retry(weekId: string) {
    setRetrying(weekId)
    try {
      await api(`/api/meeting-weeks/${weekId}/import-wol`, { method: 'POST' })
    } catch { /* ignore */ } finally {
      setRetrying(null)
      setPhase('importing')
      poll()
    }
  }

  const total = progress?.total ?? 0
  const settled = progress ? progress.ready + progress.needsReview + progress.failed : 0
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0
  const failedWeeks = progress?.weeks.filter((w) => w.importStatus === 'IMPORT_FAILED') ?? []
  const hasErrors = phase === 'done' && failedWeeks.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-card p-6 sm:p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          {phase === 'done' && !hasErrors ? (
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
          ) : hasErrors ? (
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-azure/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-azure animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink tracking-tight">
              {phase === 'startError' ? 'No se pudieron generar las semanas'
                : phase === 'done' && !hasErrors ? '¡Semanas generadas!'
                : hasErrors ? 'Semanas generadas con avisos'
                : 'Generando semanas...'}
            </h2>
            <p className="text-sm text-graphite truncate">{programName}</p>
          </div>
        </div>

        {/* Body */}
        {phase === 'startError' ? (
          <div>
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{startError}</p>
            <div className="flex justify-end mt-5">
              <button onClick={() => onClose(false)} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">Cerrar</button>
            </div>
          </div>
        ) : phase === 'starting' ? (
          <p className="text-sm text-graphite">Creando las semanas del mes...</p>
        ) : (
          <div className="space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-graphite">
                  {phase === 'done'
                    ? `${settled} de ${total} semanas procesadas`
                    : `Importando programa de Vida y Ministerio... (${settled} de ${total})`}
                </span>
                <span className="text-sm font-semibold text-ink">{pct}%</span>
              </div>
              <div className="h-2 bg-fog rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${hasErrors ? 'bg-amber-500' : phase === 'done' ? 'bg-emerald-500' : 'bg-azure'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Per-week list */}
            <div className="space-y-2">
              {(progress?.weeks ?? []).map((w) => {
                const meta = importStatusMeta(w.importStatus)
                return (
                  <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-silver-mist px-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusDot color={meta.dot} pulse={w.importStatus === 'IMPORTING'} />
                      <div className="min-w-0">
                        <p className="text-sm text-ink">Semana del {shortDate(w.weekStartDateLocal)}</p>
                        {w.importStatus === 'IMPORT_FAILED' && w.importError && (
                          <p className="text-xs text-red-600 truncate">{w.importError}</p>
                        )}
                        {w.importStatus === 'READY' && (
                          <p className="text-xs text-graphite">{w.itemCount} asignaciones</p>
                        )}
                        {w.importStatus === 'NEEDS_REVIEW' && (
                          <p className="text-xs text-amber-700">{w.itemCount} asignaciones · revisar</p>
                        )}
                      </div>
                    </div>
                    {phase === 'done' && w.importStatus === 'IMPORT_FAILED' ? (
                      <button onClick={() => retry(w.id)} disabled={retrying === w.id} className="text-xs font-medium text-azure px-3 py-1.5 rounded-pill hover:bg-azure/5 transition-colors disabled:opacity-50 shrink-0">
                        {retrying === w.id ? 'Reintentando...' : 'Reintentar'}
                      </button>
                    ) : (
                      <span className={`text-[11px] font-medium px-2.5 py-1 rounded-pill shrink-0 ${meta.className}`}>{meta.label}</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer messages / actions */}
            {phase === 'done' && !hasErrors && (
              <p className="text-sm text-emerald-700">Todo listo. Ya puedes abrir las semanas y generar participantes.</p>
            )}
            {hasErrors && (
              <div className="pt-1">
                <p className="text-sm text-graphite">
                  {failedWeeks.length} semana(s) no se pudieron importar (WOL no disponible o esa semana aún no está publicada).
                  Puedes reintentar arriba o hacerlo más tarde desde el detalle de la semana.
                </p>
                <div className="flex justify-end mt-4">
                  <button onClick={() => onClose(true)} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">Aceptar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
