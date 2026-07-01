'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { StatusDot } from '@/components'
import { importStatusMeta } from '@/lib/week-program'

interface ProgramItem {
  id: string
  itemNumber: number | null
  section: string | null
  title: string
  assignmentType: string
  durationMinutes: number | null
  context: string | null
  description: string | null
  reference: string | null
  lesson: string | null
  requiresAssistant: boolean
  sourceUrl: string | null
}

interface WeekProgramData {
  id: string
  importStatus: string
  importedAt: string | null
  importError: string | null
  wolMeetingsUrl: string | null
  wolProgramUrl: string | null
  itemCount: number
  items: ProgramItem[]
}

function sentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase('es')
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1)
}

function referenceAndLesson(item: ProgramItem): string {
  return [item.reference, item.lesson].filter(Boolean).join('; ')
}

export default function WeekProgram({ weekId, onChanged }: { weekId: string; onChanged?: () => void }) {
  const [data, setData] = useState<WeekProgramData | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualText, setManualText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [note, setNote] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/meeting-weeks/${weekId}/program`)
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [weekId])

  useEffect(() => { load() }, [load])

  function flash(type: 'success' | 'error', text: string) {
    setNote({ type, text }); setTimeout(() => setNote(null), 4000)
  }

  async function retryImport() {
    setRetrying(true)
    try {
      const res = await api(`/api/meeting-weeks/${weekId}/import-wol`, { method: 'POST' })
      const d = await res.json()
      if (res.ok && d.status !== 'IMPORT_FAILED') flash('success', `Programa importado (${d.itemCount} asignaciones)`) 
      else flash('error', d.error || 'No se pudo importar desde WOL')
    } catch { flash('error', 'Error de conexión') } finally {
      setRetrying(false)
      await load()
      onChanged?.()
    }
  }

  async function submitManual() {
    if (!manualText.trim()) return
    setSubmitting(true)
    try {
      const res = await api(`/api/meeting-weeks/${weekId}/import-wol-manual`, {
        method: 'POST',
        body: JSON.stringify({ text: manualText }),
      })
      const d = await res.json()
      if (res.ok && d.status !== 'IMPORT_FAILED') {
        flash('success', `Programa capturado (${d.itemCount} asignaciones)`)
        setManualOpen(false); setManualText('')
      } else {
        flash('error', d.error || 'No se pudo interpretar el texto')
      }
    } catch { flash('error', 'Error de conexión') } finally {
      setSubmitting(false)
      await load()
      onChanged?.()
    }
  }

  if (loading) return <div className="h-40 bg-white rounded-card animate-pulse" />
  if (!data) return null

  const meta = importStatusMeta(data.importStatus)
  const failed = data.importStatus === 'IMPORT_FAILED'
  const empty = data.importStatus === 'EMPTY'

  return (
    <div className="bg-white rounded-card p-5 sm:p-7">
      {/* Header: status + source */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot color={meta.dot} pulse={data.importStatus === 'IMPORTING'} />
            <h2 className="text-lg font-semibold text-ink tracking-tight">Programa (Vida y Ministerio)</h2>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-pill ${meta.className}`}>{meta.label}</span>
          </div>
          <p className="text-sm text-graphite mt-1">{meta.message}</p>
          <p className="text-sm text-graphite mt-1">{data.itemCount} asignaciones importadas</p>
          {data.wolProgramUrl && data.wolProgramUrl.startsWith('http') ? (
            <a href={data.wolProgramUrl} target="_blank" rel="noreferrer" className="text-xs text-azure hover:underline inline-flex items-center gap-1 mt-1">Fuente WOL</a>
          ) : data.wolMeetingsUrl ? (
            <a href={data.wolMeetingsUrl} target="_blank" rel="noreferrer" className="text-xs text-azure hover:underline inline-flex items-center gap-1 mt-1">Fuente WOL</a>
          ) : null}
          {failed && data.importError && (
            <p className="text-xs text-red-600 mt-2 break-words">{data.importError}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={retryImport}
            disabled={retrying}
            className="text-sm font-medium text-ink px-4 py-2 rounded-pill border border-silver-mist hover:bg-fog transition-colors disabled:opacity-50"
          >
            {retrying ? 'Importando...' : 'Reintentar importación'}
          </button>
          <button
            onClick={() => setManualOpen((v) => !v)}
            className="text-sm font-medium text-graphite px-4 py-2 rounded-pill border border-silver-mist hover:bg-fog transition-colors"
          >
            Capturar manualmente
          </button>
        </div>
      </div>

      {note && (
        <div className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${note.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</div>
      )}

      {/* Manual capture */}
      {manualOpen && (
        <div className="mt-4 border border-silver-mist rounded-card p-4">
          <label className="block text-sm font-medium text-ink mb-1.5">Pegar el texto del programa de la semana (respaldo si WOL falla)</label>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={6}
            placeholder={'Lectura de la Biblia\n(4 mins.) ...\n\n4. Empiece conversaciones\n(3 mins.) ...'}
            className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-y font-mono"
          />
          <div className="flex gap-2 mt-3">
            <button onClick={submitManual} disabled={submitting || !manualText.trim()} className="bg-azure text-white text-sm font-medium px-5 py-2 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
              {submitting ? 'Procesando...' : 'Importar del texto'}
            </button>
            <button onClick={() => { setManualOpen(false); setManualText('') }} className="text-sm text-graphite px-5 py-2 rounded-pill border border-silver-mist hover:bg-fog transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="mt-5">
        {data.items.length === 0 ? (
          <div className="rounded-card bg-fog px-4 py-6 text-center">
            <p className="text-sm text-graphite">{empty ? 'Sin programa importado.' : 'No hay asignaciones en el programa.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.items.map((item) => {
              const label = item.itemNumber != null ? `${item.itemNumber}. ${item.title}` : item.title
              const ref = referenceAndLesson(item)
              return (
                <div key={item.id} className="border border-silver-mist rounded-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{label}</p>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-pill shrink-0 ${item.requiresAssistant ? 'bg-azure/10 text-azure' : 'bg-fog text-graphite'}`}>
                      {item.requiresAssistant ? 'Requiere acompañante' : 'Individual'}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {item.durationMinutes != null && (
                      <div><dt className="inline text-graphite">Duración: </dt><dd className="inline text-ink">{item.durationMinutes} minutos</dd></div>
                    )}
                    {item.context && (
                      <div><dt className="inline text-graphite">Contexto: </dt><dd className="inline text-ink">{sentenceCase(item.context)}</dd></div>
                    )}
                    {item.description && (
                      <div className="sm:col-span-2"><dt className="inline text-graphite">Instrucción: </dt><dd className="inline text-ink">{item.description}</dd></div>
                    )}
                    {ref && (
                      <div className="sm:col-span-2"><dt className="inline text-graphite">Referencia: </dt><dd className="inline text-ink">{ref}</dd></div>
                    )}
                  </dl>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
