'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import ConfirmModal from '@/components/ConfirmModal'

interface PubRef { id: string; name: string }
interface ProposalAssignment {
  id: string
  assignmentNumber: number
  title: string
  section: string
  assignmentType: string
  needsCompanion: boolean
  assigned: PubRef | null
  companion: PubRef | null
}
interface ProposalWeek {
  id: string
  weekStartDate: string
  meetingDate: string
  meetingTime: string
  status: string
  assignments: ProposalAssignment[]
}
interface Publisher { id: string; name: string; canBeCompanion: boolean }
interface Proposal {
  programId: string
  name: string
  status: string
  hasProposal: boolean
  proposedCount: number
  weeks: ProposalWeek[]
  publishers: Publisher[]
}

function formatDateShort(iso: string): string {
  const [d] = iso.split('T'); const [, m, day] = d.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${day}-${months[m - 1]}`
}

type ConfirmState = { title: string; description?: React.ReactNode; confirmLabel?: string; tone?: 'default' | 'danger' | 'warning'; run: () => Promise<void> } | null

export default function ProposalPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [data, setData] = useState<Proposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [allowSame, setAllowSame] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [savingRow, setSavingRow] = useState('')

  function notify(type: 'success' | 'error', text: string) {
    setToast({ type, text }); setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/monthly-schedules/${id}/proposal`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const readOnly = data?.status === 'ARCHIVED' || data?.status === 'CANCELLED'

  async function generate(regenerate: boolean) {
    const key = regenerate ? 'regen' : 'gen'
    setBusy(key)
    try {
      const url = regenerate ? `/api/monthly-schedules/${id}/regenerate-proposal` : `/api/monthly-schedules/${id}/generate-proposal`
      const res = await api(url, { method: 'POST', body: JSON.stringify({ allowSamePersonTwicePerWeek: allowSame }) })
      const d = await res.json()
      if (res.ok) {
        setWarnings(d.warnings || [])
        notify('success', `${d.created || 0} asignaciones propuestas${d.discarded ? `, ${d.discarded} descartadas` : ''}`)
        await load()
      } else notify('error', d.error || 'No se pudo generar la propuesta')
    } catch { notify('error', 'Error de conexion') } finally { setBusy('') }
  }

  async function approve() {
    setBusy('approve')
    try {
      const res = await api(`/api/monthly-schedules/${id}/approve-proposal`, { method: 'POST' })
      const d = await res.json()
      if (res.ok) { notify('success', `${d.approved || 0} asignaciones aprobadas (ahora en borrador)`); setWarnings([]); await load() }
      else notify('error', d.error || 'No se pudo aprobar')
    } catch { notify('error', 'Error de conexion') } finally { setBusy('') }
  }

  async function discard() {
    setBusy('discard')
    try {
      const res = await api(`/api/monthly-schedules/${id}/discard-proposal`, { method: 'POST' })
      const d = await res.json()
      if (res.ok) { notify('success', `${d.discarded || 0} asignaciones descartadas`); setWarnings([]); await load() }
      else notify('error', d.error || 'No se pudo descartar')
    } catch { notify('error', 'Error de conexion') } finally { setBusy('') }
  }

  async function changePublisher(assignmentId: string, field: 'assignedPublisherId' | 'companionPublisherId', value: string) {
    setSavingRow(`${assignmentId}-${field}`)
    try {
      const res = await api(`/api/assignments/${assignmentId}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) })
      if (res.ok) { await load() } else { const d = await res.json(); notify('error', d.error || 'No se pudo actualizar') }
    } catch { notify('error', 'Error de conexion') } finally { setSavingRow('') }
  }

  function askApprove() {
    setConfirm({
      title: 'Aprobar propuesta',
      description: <>Se convertiran <strong className="text-ink">{data?.proposedCount}</strong> asignaciones propuestas en asignaciones reales (borrador). No se generan automatizaciones; eso se hace despues desde el programa.</>,
      confirmLabel: 'Aprobar',
      run: approve,
    })
  }
  function askDiscard() {
    setConfirm({
      title: 'Descartar propuesta',
      description: <>Se eliminaran todas las asignaciones propuestas de <strong className="text-ink">{data?.name}</strong>. Las asignaciones ya aprobadas no se tocan.</>,
      confirmLabel: 'Descartar',
      tone: 'danger',
      run: discard,
    })
  }
  function askRegenerate() {
    setConfirm({
      title: 'Regenerar propuesta',
      description: <>Se descartara la propuesta actual y se generara una nueva distribucion equilibrada.</>,
      confirmLabel: 'Regenerar',
      tone: 'warning',
      run: () => generate(true),
    })
  }

  async function handleConfirm() {
    if (!confirm) return
    setConfirmLoading(true)
    try { await confirm.run() } finally { setConfirmLoading(false); setConfirm(null) }
  }

  if (loading) return <div className="h-64 bg-white rounded-card animate-pulse" />
  if (!data) return (
    <div className="bg-white rounded-card p-7 text-center py-16">
      <p className="text-sm text-graphite">Programa no encontrado</p>
      <Link href="/dashboard/programas" className="inline-block mt-4 bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill">Volver</Link>
    </div>
  )

  const companions = data.publishers.filter((p) => p.canBeCompanion)

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/programas/${id}`} className="text-xs text-graphite hover:text-ink transition-colors inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          {data.name}
        </Link>
        <h1 className="text-2xl font-semibold text-ink tracking-tight mt-2">Propuesta de asignaciones</h1>
        <p className="text-sm text-graphite mt-1">Genera una distribucion equilibrada, revisala y edita si hace falta. Nada se vuelve definitivo hasta que apruebes.</p>
      </div>

      {toast && <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{toast.text}</div>}

      {/* Flow hint */}
      <div className="bg-fog rounded-card px-5 py-4">
        <p className="text-sm text-graphite">Flujo: Generar propuesta &rarr; Revisar / editar &rarr; <span className="text-ink font-medium">Aprobar</span> (crea asignaciones reales) &rarr; volver al programa para <Link href={`/dashboard/programas/${id}`} className="text-azure font-medium hover:underline">generar automatizaciones</Link>.</p>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-card p-5 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {!data.hasProposal ? (
            <button onClick={() => generate(false)} disabled={readOnly || busy === 'gen'} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
              {busy === 'gen' ? 'Generando...' : 'Generar propuesta'}
            </button>
          ) : (
            <>
              <button onClick={askApprove} disabled={readOnly || busy === 'approve'} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
                {busy === 'approve' ? 'Aprobando...' : `Aprobar (${data.proposedCount})`}
              </button>
              <button onClick={askRegenerate} disabled={readOnly || busy === 'regen'} className="text-caution text-sm font-medium px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors disabled:opacity-50">
                {busy === 'regen' ? 'Regenerando...' : 'Regenerar'}
              </button>
              <button onClick={askDiscard} disabled={readOnly || busy === 'discard'} className="text-red-600 text-sm font-medium px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-red-50 transition-colors disabled:opacity-50">
                {busy === 'discard' ? 'Descartando...' : 'Descartar'}
              </button>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-graphite ml-auto">
            <input type="checkbox" checked={allowSame} onChange={(e) => setAllowSame(e.target.checked)} className="rounded border-silver-mist" />
            Permitir repetir persona en la misma semana
          </label>
        </div>
        {readOnly && <p className="text-xs text-graphite">El programa esta archivado o cancelado; la propuesta es de solo lectura.</p>}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 rounded-card px-5 py-4">
          <p className="text-sm font-medium text-amber-800 mb-1">Avisos de la generacion</p>
          <ul className="list-disc list-inside text-sm text-amber-700 space-y-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Proposal by week */}
      {!data.hasProposal ? (
        <div className="bg-white rounded-card p-7 text-center py-12">
          <p className="text-sm text-graphite">No hay propuesta todavia. Genera una para revisarla aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.weeks.filter((w) => w.assignments.length > 0).map((week) => (
            <div key={week.id} className="bg-white rounded-card overflow-hidden">
              <div className="px-5 py-4 border-b border-silver-mist">
                <h2 className="text-sm font-semibold text-ink">Semana del {formatDateShort(week.weekStartDate)}</h2>
                <p className="text-xs text-graphite">Reunion {formatDateShort(week.meetingDate)} a las {week.meetingTime}</p>
              </div>
              <div className="divide-y divide-silver-mist">
                {week.assignments.map((a) => (
                  <div key={a.id} className="px-5 py-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-3 md:items-center">
                    <div>
                      <p className="text-sm font-medium text-ink">{a.assignmentNumber}. {a.title}</p>
                      <p className="text-xs text-graphite">{a.section === 'BIBLE_READING' ? 'Lectura de la Biblia' : 'Seamos mejores maestros'}</p>
                    </div>
                    <div>
                      <label className="block text-[11px] text-graphite mb-1">Asignado</label>
                      <select
                        value={a.assigned?.id || ''}
                        disabled={readOnly || savingRow === `${a.id}-assignedPublisherId`}
                        onChange={(e) => changePublisher(a.id, 'assignedPublisherId', e.target.value)}
                        className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm bg-white disabled:opacity-50"
                      >
                        {data.publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      {a.needsCompanion ? (
                        <>
                          <label className="block text-[11px] text-graphite mb-1">Acompanante</label>
                          <select
                            value={a.companion?.id || ''}
                            disabled={readOnly || savingRow === `${a.id}-companionPublisherId`}
                            onChange={(e) => changePublisher(a.id, 'companionPublisherId', e.target.value)}
                            className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm bg-white disabled:opacity-50"
                          >
                            {a.companion ? null : <option value="">Sin acompanante</option>}
                            {companions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </>
                      ) : (
                        <p className="text-xs text-graphite md:text-center">Individual</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirm !== null}
        title={confirm?.title || ''}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        loading={confirmLoading}
        onConfirm={handleConfirm}
        onCancel={() => !confirmLoading && setConfirm(null)}
      />
    </div>
  )
}
