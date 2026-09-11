'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import ConfirmModal from '@/components/ConfirmModal'
import { SearchableSelect } from '@/components/SearchableSelect'
import { isCompanionGenderAllowed, isPublisherEligibleForAssignment, type GenderValue } from '@/lib/assignment-rules'
import { importStatusMeta, PARTICIPANTS_BLOCKED_MESSAGE } from '@/lib/week-program'

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
  importStatus?: string
  programItemCount?: number
  assignments: ProposalAssignment[]
}
interface Publisher {
  id: string
  name: string
  canBeCompanion: boolean
  gender: GenderValue | null
  isActive?: boolean
  canReceiveAssignments?: boolean
  canBibleReading?: boolean
  canGiveTalk?: boolean
  canParticipateSMM?: boolean
  canBeChairman?: boolean
  canTreasures?: boolean
  canSpiritualGems?: boolean
  canChristianLife?: boolean
  canConductCBS?: boolean
  canReadCBS?: boolean
}
interface Proposal {
  programId: string
  name: string
  status: string
  hasProposal: boolean
  proposedCount: number
  allWeeksReady?: boolean
  weeks: ProposalWeek[]
  publishers: Publisher[]
}

function formatDateShort(iso: string): string {
  const [d] = iso.split('T'); const [, m, day] = d.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${day} ${months[m - 1]}`
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
  const [showWarnings, setShowWarnings] = useState(false)
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
        notify('success', `${d.created || 0} asignaciones propuestas`)
        await load()
      } else notify('error', d.error || 'No se pudo generar la propuesta')
    } catch { notify('error', 'Error de conexion') } finally { setBusy('') }
  }

  async function approve() {
    setBusy('approve')
    try {
      const res = await api(`/api/monthly-schedules/${id}/approve-proposal`, { method: 'POST' })
      const d = await res.json()
      if (res.ok) { notify('success', `${d.approved || 0} asignaciones aprobadas`); setWarnings([]); await load() }
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
    setConfirm({ title: 'Aprobar propuesta', description: <>Se convertiran <strong className="text-ink">{data?.proposedCount}</strong> asignaciones en borrador. Las automatizaciones se generan despues desde el programa.</>, confirmLabel: 'Aprobar', run: approve })
  }
  function askDiscard() {
    setConfirm({ title: 'Descartar propuesta', description: <>Se eliminaran todas las asignaciones propuestas. Las asignaciones ya aprobadas no se tocan.</>, confirmLabel: 'Descartar', tone: 'danger', run: discard })
  }
  function askRegenerate() {
    setConfirm({ title: 'Generar otra propuesta', description: <>Se descartara la propuesta actual y se generara una nueva distribucion equilibrada.</>, confirmLabel: 'Generar', tone: 'warning', run: () => generate(true) })
  }

  async function handleConfirm() {
    if (!confirm) return
    setConfirmLoading(true)
    try { await confirm.run() } finally { setConfirmLoading(false); setConfirm(null) }
  }

  // ─── Loading / Not found ─────────────────────────────────
  if (loading) return (
    <div className="mx-auto w-full max-w-6xl animate-pulse space-y-4">
      <div className="h-10 w-48 bg-silver-mist/40 rounded-xl" />
      <div className="h-20 bg-white rounded-2xl" />
      <div className="h-64 bg-white rounded-2xl" />
    </div>
  )
  if (!data) return (
    <div className="mx-auto w-full max-w-6xl bg-white rounded-2xl p-12 text-center">
      <p className="text-sm text-graphite">Programa no encontrado</p>
      <Link href="/dashboard/programas" className="inline-block mt-4 bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-xl">Volver</Link>
    </div>
  )

  const blocked = data.allWeeksReady === false
  const weeksWithAssignments = data.weeks.filter((w) => w.assignments.length > 0)
  const uniquePublishers = new Set(weeksWithAssignments.flatMap((w) => w.assignments.map((a) => a.assigned?.id).filter(Boolean)))

  // Humanize warnings: strip internal IDs
  const humanWarnings = warnings.map((w) => w.replace(/\b[a-z0-9]{20,}\b:?\s*/gi, '').replace(/^Semana\s*/, 'Una semana: '))

  return (
    <div className="mx-auto w-full max-w-6xl">
      {toast && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{toast.text}</div>
      )}

      <div className="flex flex-col lg:flex-row gap-5">
        {/* ━━━ MAIN COLUMN ━━━ */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Header */}
          <header>
            <Link href={`/dashboard/programas/${id}`} className="text-xs text-graphite hover:text-ink transition-colors inline-flex items-center gap-1 mb-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              {data.name}
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-ink tracking-tight">Propuesta de asignaciones</h1>
              {data.hasProposal && (
                <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full ${warnings.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {warnings.length > 0 ? 'Con observaciones' : 'Lista para revisar'}
                </span>
              )}
            </div>
            <p className="text-xs text-graphite mt-1">Revisa la distribucion antes de aprobarla. Al aprobar, las asignaciones se agregaran al programa.</p>
          </header>

          {/* Blocked warning */}
          {blocked && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200/60 px-5 py-4">
              <p className="text-sm font-medium text-amber-800">Aun no se pueden generar participantes</p>
              <p className="text-xs text-amber-700 mt-0.5">{PARTICIPANTS_BLOCKED_MESSAGE} Importa el programa de cada semana desde WOL antes de generar participantes.</p>
            </div>
          )}

          {/* Summary bar (only if proposal exists) */}
          {data.hasProposal && (
            <div className="bg-white rounded-[18px] border border-[#E8E8E8] px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div><span className="text-lg font-semibold text-ink">{data.proposedCount}</span><span className="text-[11px] text-graphite ml-1.5">asignaciones</span></div>
              <div><span className="text-lg font-semibold text-ink">{weeksWithAssignments.length}</span><span className="text-[11px] text-graphite ml-1.5">semanas</span></div>
              <div><span className="text-lg font-semibold text-ink">{uniquePublishers.size}</span><span className="text-[11px] text-graphite ml-1.5">publicadores</span></div>
              {warnings.length > 0 && (
                <div><span className="text-lg font-semibold text-amber-600">{warnings.length}</span><span className="text-[11px] text-amber-600 ml-1.5">observaciones</span></div>
              )}
            </div>
          )}

          {/* Warnings summary */}
          {warnings.length > 0 && (
            <div className="bg-amber-50/60 rounded-[18px] border border-amber-200/50 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-amber-800">Observaciones de la propuesta</p>
                  <p className="text-xs text-amber-700 mt-0.5">Se reutilizaron publicadores en algunas semanas porque no habia suficientes personas disponibles.</p>
                </div>
                <button onClick={() => setShowWarnings(!showWarnings)} className="text-[11px] font-medium text-amber-700 hover:text-amber-900 whitespace-nowrap flex-shrink-0 px-2 py-1 rounded-lg hover:bg-amber-100/50 transition-colors">
                  {showWarnings ? 'Ocultar' : 'Ver detalles'}
                </button>
              </div>
              {showWarnings && (
                <ul className="mt-3 pt-3 border-t border-amber-200/50 space-y-1 text-xs text-amber-700 max-h-40 overflow-y-auto">
                  {humanWarnings.map((w, i) => <li key={i} className="leading-relaxed">• {w}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Assignments by week */}
          {!data.hasProposal ? (
            <div className="bg-white rounded-2xl border border-[#E8E8E8] p-10 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-fog flex items-center justify-center">
                <svg className="w-6 h-6 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
              </div>
              <p className="text-sm font-medium text-ink">Sin propuesta generada</p>
              <p className="text-xs text-graphite mt-1">Genera una propuesta para revisar la distribucion de participantes.</p>
              {!readOnly && !blocked && (
                <button onClick={() => generate(false)} disabled={busy === 'gen'} className="mt-4 bg-azure text-white text-xs font-medium px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                  {busy === 'gen' ? 'Generando...' : 'Generar participantes'}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {weeksWithAssignments.map((week) => (
                <div key={week.id} className="bg-white rounded-2xl border border-[#E8E8E8] overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#E8E8E8] flex items-center justify-between gap-2 bg-fog/20">
                    <div>
                      <h2 className="text-sm font-semibold text-ink">Semana del {formatDateShort(week.weekStartDate)}</h2>
                      <p className="text-[11px] text-graphite">Reunion {formatDateShort(week.meetingDate)} · {week.meetingTime} · {week.assignments.length} asignaciones</p>
                    </div>
                    {week.importStatus && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${importStatusMeta(week.importStatus).className}`}>
                        {importStatusMeta(week.importStatus).label}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-[#E8E8E8]">
                    {week.assignments.map((a) => (
                      <AssignmentRow key={a.id} assignment={a} publishers={data.publishers} readOnly={readOnly || false} savingRow={savingRow} onChangePublisher={changePublisher} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ━━━ SIDEBAR ━━━ */}
        <aside className="lg:w-[280px] lg:sticky lg:top-4 lg:self-start space-y-4">
          {/* Actions (only show when proposal exists) */}
          {data.hasProposal && (
            <div className="bg-white rounded-[18px] border border-[#E8E8E8] p-5 space-y-3">
              <button onClick={askApprove} disabled={readOnly || blocked || busy === 'approve'} className="w-full bg-azure text-white text-sm font-medium h-[44px] rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                {busy === 'approve' ? 'Aprobando...' : `Aprobar propuesta (${data.proposedCount})`}
              </button>
              <button onClick={askRegenerate} disabled={readOnly || blocked || busy === 'regen'} className="w-full text-sm font-medium h-[44px] rounded-xl border border-silver-mist text-ink hover:bg-fog transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {busy === 'regen' ? 'Generando...' : 'Generar otra propuesta'}
              </button>
              <button onClick={askDiscard} disabled={readOnly || busy === 'discard'} className="w-full text-sm font-medium h-[44px] rounded-xl text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                {busy === 'discard' ? 'Descartando...' : 'Descartar propuesta'}
              </button>
              {readOnly && <p className="text-[11px] text-graphite text-center">Programa archivado — solo lectura.</p>}
            </div>
          )}

          {/* Generation options */}
          <div className="bg-white rounded-[18px] border border-[#E8E8E8] p-5">
            <h3 className="text-xs font-semibold text-ink mb-2">Opciones de generacion</h3>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" checked={allowSame} onChange={(e) => setAllowSame(e.target.checked)} className="mt-0.5 rounded border-silver-mist text-azure focus:ring-azure/30" />
              <div>
                <p className="text-xs font-medium text-ink group-hover:text-azure transition-colors">Permitir repetir publicadores en la misma semana</p>
                <p className="text-[11px] text-graphite mt-0.5">Usalo cuando no haya suficientes personas para cubrir todas las asignaciones.</p>
              </div>
            </label>
          </div>
        </aside>
      </div>

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

// ─── Assignment Row ─────────────────────────────────────────
function AssignmentRow({ assignment: a, publishers, readOnly, savingRow, onChangePublisher }: {
  assignment: ProposalAssignment
  publishers: Publisher[]
  readOnly: boolean
  savingRow: string
  onChangePublisher: (id: string, field: 'assignedPublisherId' | 'companionPublisherId', value: string) => void
}) {
  return (
    <div className="px-5 py-3.5 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-3 md:items-center">
      <div>
        <p className="text-sm font-medium text-ink">{a.assignmentNumber}. {a.title}</p>
        <p className="text-[11px] text-graphite">{a.section === 'BIBLE_READING' ? 'Lectura de la Biblia' : 'Seamos mejores maestros'}</p>
      </div>
      <div>
        <label className="block text-[10px] text-graphite mb-0.5">Participante</label>
        <SearchableSelect
          value={a.assigned?.id || ''}
          disabled={readOnly || savingRow === `${a.id}-assignedPublisherId`}
          onChange={(value) => onChangePublisher(a.id, 'assignedPublisherId', value)}
          options={publishers
            .filter((p) => isPublisherEligibleForAssignment(p, a.assignmentType, 'ASSIGNEE'))
            .map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Seleccionar"
          searchPlaceholder="Buscar publicador..."
        />
      </div>
      <div>
        {a.needsCompanion ? (
          <>
            <label className="block text-[10px] text-graphite mb-0.5">Acompanante</label>
            <SearchableSelect
              value={a.companion?.id || ''}
              disabled={readOnly || savingRow === `${a.id}-companionPublisherId`}
              onChange={(value) => onChangePublisher(a.id, 'companionPublisherId', value)}
              options={publishers
                .filter((p) =>
                  p.id !== a.assigned?.id &&
                  isPublisherEligibleForAssignment(p, a.assignmentType, 'COMPANION') &&
                  isCompanionGenderAllowed(
                    a.assignmentType,
                    publishers.find((x) => x.id === a.assigned?.id)?.gender ?? null,
                    p.gender,
                  ),
                )
                .map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Sin acompanante"
              emptyOptionLabel="Sin acompanante"
              searchPlaceholder="Buscar acompanante..."
            />
            {!a.companion && <p className="text-[10px] text-amber-700 mt-0.5">Requiere acompanante</p>}
          </>
        ) : (
          <p className="text-[11px] text-graphite md:text-center">Individual</p>
        )}
      </div>
    </div>
  )
}
