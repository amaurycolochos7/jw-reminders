'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

interface ProviderInfo { id: string; name: string; description: string; available: boolean; inputHint: string }
interface PreviewPart { assignmentNumber: number; section: string; assignmentType: string; title: string; durationMinutes?: number; needsCompanion: boolean }
interface PreviewWeek { meetingDateLocal: string; weekStartDateLocal: string; meetingTime: string; exists: boolean; partsCount: number; parts: PreviewPart[] }
interface PreviewProgram { year: number; month: number; name: string; programExists: boolean; weeks: PreviewWeek[] }
interface Validation { valid: boolean; errors: string[]; warnings: string[] }
interface PreviewResponse { provider: string; validation: Validation; program: PreviewProgram | null }

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WEEK_DAYS = [
  { value: 0, label: 'Domingo' }, { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' }, { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sabado' },
]

const SAMPLE_JSON = `{
  "year": 2026,
  "month": 7,
  "name": "Julio 2026",
  "weeks": [
    {
      "meetingDate": "2026-07-03",
      "meetingTime": "19:00",
      "parts": [
        { "section": "BIBLE_READING", "type": "BIBLE_READING", "title": "Lectura de la Biblia", "durationMinutes": 4 },
        { "section": "APPLY_YOURSELF", "type": "START_CONVERSATION", "title": "Empiece conversaciones", "durationMinutes": 3 },
        { "section": "APPLY_YOURSELF", "type": "MAKE_RETURN_VISIT", "title": "Haga revisitas", "durationMinutes": 4 },
        { "section": "APPLY_YOURSELF", "type": "TALK", "title": "Discurso", "durationMinutes": 5 }
      ]
    }
  ]
}`

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d}-${months[m - 1]}`
}

export default function ImportarPage() {
  const now = new Date()
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [providerId, setProviderId] = useState('manual')
  const [manualForm, setManualForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, meetingDayOfWeek: 5, meetingTime: '19:00', preset: 'standard' as 'standard' | 'extended' })
  const [jsonPayload, setJsonPayload] = useState(SAMPLE_JSON)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/imports/providers').then(async (res) => { if (res.ok) setProviders(await res.json()) })
  }, [])

  const provider = providers.find((p) => p.id === providerId)

  function buildInput(): unknown {
    if (providerId === 'manual') {
      return {
        year: Number(manualForm.year),
        month: Number(manualForm.month),
        meetingDayOfWeek: Number(manualForm.meetingDayOfWeek),
        meetingTime: manualForm.meetingTime,
        preset: manualForm.preset,
      }
    }
    if (providerId === 'import') return { payload: jsonPayload }
    return {}
  }

  // Any change invalidates a previous preview so confirm is never used "directly".
  function resetPreview() { setPreview(null); setResult(null); setError('') }

  async function doPreview() {
    setPreviewing(true); setError(''); setResult(null)
    try {
      const res = await api('/api/imports/preview', { method: 'POST', body: JSON.stringify({ provider: providerId, input: buildInput() }) })
      const data = await res.json()
      if (res.ok) setPreview(data)
      else { setPreview(null); setError(data.error || 'No se pudo previsualizar') }
    } catch { setError('Error de conexion') } finally { setPreviewing(false) }
  }

  async function doConfirm() {
    if (!preview?.validation.valid) return
    setConfirming(true); setError('')
    try {
      const res = await api('/api/imports/confirm', { method: 'POST', body: JSON.stringify({ provider: providerId, input: buildInput() }) })
      const data = await res.json()
      if (res.ok) { setResult(data); setPreview(null) }
      else setError(data.error || 'No se pudo confirmar la importacion')
    } catch { setError('Error de conexion') } finally { setConfirming(false) }
  }

  const canConfirm = preview?.validation.valid && (preview.program?.weeks.some((w) => !w.exists) ?? false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Importar programa</h1>
        <p className="text-sm text-graphite mt-1">Selecciona un proveedor, previsualiza, valida y confirma. La importacion nunca es directa: primero se previsualiza.</p>
      </div>

      <div className="bg-fog rounded-card px-5 py-4">
        <p className="text-sm text-graphite">Flujo: Seleccionar proveedor &rarr; Previsualizar &rarr; Validar &rarr; <span className="text-ink font-medium">Confirmar</span>. Al confirmar se crean el programa, las semanas y las <span className="text-ink font-medium">plantillas de asignaciones</span> (sin asignar personas).</p>
      </div>

      {/* Provider selector */}
      <div className="bg-white rounded-card p-5 sm:p-7 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Proveedor</label>
          <select value={providerId} onChange={(e) => { setProviderId(e.target.value); resetPreview() }} className="w-full max-w-md px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
            {providers.map((p) => <option key={p.id} value={p.id} disabled={!p.available}>{p.name}{p.available ? '' : ' (no disponible)'}</option>)}
          </select>
          {provider && <p className="text-xs text-graphite mt-2">{provider.description}</p>}
          {provider && !provider.available && <p className="text-xs text-caution mt-1">{provider.inputHint}</p>}
        </div>

        {/* Manual provider form */}
        {providerId === 'manual' && provider?.available && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Mes</label>
              <select value={manualForm.month} onChange={(e) => { setManualForm({ ...manualForm, month: Number(e.target.value) }); resetPreview() }} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Ano</label>
              <input type="number" value={manualForm.year} onChange={(e) => { setManualForm({ ...manualForm, year: Number(e.target.value) }); resetPreview() }} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Dia de reunion</label>
              <select value={manualForm.meetingDayOfWeek} onChange={(e) => { setManualForm({ ...manualForm, meetingDayOfWeek: Number(e.target.value) }); resetPreview() }} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
                {WEEK_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Hora</label>
              <input type="time" value={manualForm.meetingTime} onChange={(e) => { setManualForm({ ...manualForm, meetingTime: e.target.value }); resetPreview() }} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Partes</label>
              <select value={manualForm.preset} onChange={(e) => { setManualForm({ ...manualForm, preset: e.target.value as any }); resetPreview() }} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
                <option value="standard">Estandar (4 partes)</option>
                <option value="extended">Extendida (6 partes)</option>
              </select>
            </div>
          </div>
        )}

        {/* Import provider textarea */}
        {providerId === 'import' && provider?.available && (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Programa en JSON</label>
            <textarea value={jsonPayload} onChange={(e) => { setJsonPayload(e.target.value); resetPreview() }} rows={12} spellCheck={false}
              className="w-full px-4 py-3 border border-silver-mist rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-azure/30" />
            <p className="text-xs text-graphite mt-1">{provider.inputHint}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button onClick={doPreview} disabled={previewing || !provider?.available} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
            {previewing ? 'Previsualizando...' : 'Previsualizar'}
          </button>
          <button onClick={doConfirm} disabled={!canConfirm || confirming} className="bg-emerald-600 text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
            {confirming ? 'Confirmando...' : 'Confirmar importacion'}
          </button>
          {!preview && !result && <span className="text-xs text-graphite">Previsualiza antes de confirmar.</span>}
          {preview && !canConfirm && preview.validation.valid && <span className="text-xs text-graphite">Todas las semanas ya existen; no hay nada nuevo que importar.</span>}
        </div>

        {error && <p className="text-sm text-red-600 p-3 bg-red-50 rounded-xl">{error}</p>}
      </div>

      {/* Result */}
      {result && (
        <div className="bg-white rounded-card p-5 sm:p-7">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <h2 className="text-base font-semibold text-ink">Importacion completada</h2>
          </div>
          <p className="text-sm text-graphite">Programa <strong className="text-ink">{result.name}</strong>: {result.weeksCreated} semanas creadas, {result.weeksSkipped} ya existian, {result.templatesCreated} plantillas de asignaciones creadas.</p>
          <div className="flex gap-2 mt-4">
            <Link href={`/dashboard/programas/${result.programId}`} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">Ver programa</Link>
            <Link href={`/dashboard/programas/${result.programId}/propuesta`} className="text-graphite text-sm font-medium px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">Generar propuesta</Link>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          {/* Validation */}
          {preview.validation.errors.length > 0 && (
            <div className="bg-red-50 rounded-card px-5 py-4">
              <p className="text-sm font-medium text-red-800 mb-1">Errores de validacion</p>
              <ul className="list-disc list-inside text-sm text-red-700 space-y-0.5">{preview.validation.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          {preview.validation.warnings.length > 0 && (
            <div className="bg-amber-50 rounded-card px-5 py-4">
              <p className="text-sm font-medium text-amber-800 mb-1">Avisos</p>
              <ul className="list-disc list-inside text-sm text-amber-700 space-y-0.5">{preview.validation.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          {preview.program && (
            <div className="bg-white rounded-card p-5 sm:p-7">
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <h2 className="text-base font-semibold text-ink">Previsualizacion: {preview.program.name}</h2>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-pill ${preview.validation.valid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {preview.validation.valid ? 'Valido' : 'Con errores'}
                </span>
              </div>
              {preview.program.programExists && <p className="text-xs text-graphite mb-3">El programa ya existe; solo se crearan las semanas nuevas.</p>}
              <div className="space-y-3">
                {preview.program.weeks.map((w) => (
                  <div key={w.meetingDateLocal} className={`rounded-xl border p-4 ${w.exists ? 'border-silver-mist bg-fog/40' : 'border-silver-mist'}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-ink">Semana del {formatDateShort(w.weekStartDateLocal)} / reunion {formatDateShort(w.meetingDateLocal)} {w.meetingTime}</p>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-pill ${w.exists ? 'bg-fog text-graphite' : 'bg-emerald-50 text-emerald-700'}`}>{w.exists ? 'Ya existe (se omite)' : `${w.partsCount} plantillas`}</span>
                    </div>
                    <ul className="text-xs text-graphite space-y-0.5">
                      {w.parts.map((p) => (
                        <li key={p.assignmentNumber}>{p.assignmentNumber}. {p.title} <span className="text-graphite/70">({p.section === 'BIBLE_READING' ? 'Lectura' : 'SMM'}{p.needsCompanion ? ', con acompanante' : ''}{p.durationMinutes ? `, ${p.durationMinutes} min` : ''})</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
