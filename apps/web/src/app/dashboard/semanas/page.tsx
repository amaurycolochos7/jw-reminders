'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

interface MeetingWeek {
  id: string
  weekStartDate: string
  meetingDate: string
  meetingTime: string
  congregationName: string | null
  notes: string | null
  status: string
  monthlyScheduleId: string | null
  monthlySchedule: { id: string; name: string } | null
  _count?: { assignments: number }
  totalReminders?: number
  pendingReminders?: number
  sentReminders?: number
  failedReminders?: number
}

/**
 * Formats an ISO date string without timezone shift.
 * "2026-06-22T00:00:00.000Z" -> "22 jun 2026"
 */
function formatDate(iso: string): string {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${months[m - 1]} ${y}`
}

function formatDateShort(iso: string): string {
  const [datePart] = iso.split('T')
  const [, m, d] = datePart.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d}-${months[m - 1]}`
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-amber-50 text-amber-700' },
  READY: { label: 'Lista', className: 'bg-fog text-azure' },
  ACTIVE: { label: 'Activa', className: 'bg-emerald-50 text-emerald-700' },
  COMPLETED: { label: 'Completada', className: 'bg-fog text-graphite' },
  ARCHIVED: { label: 'Archivada', className: 'bg-fog text-graphite' },
  CANCELLED: { label: 'Cancelada', className: 'bg-red-50 text-red-700' },
}

function completion(week: MeetingWeek): number {
  const total = week.totalReminders || 0
  const steps = [
    true, // semana creada
    (week._count?.assignments || 0) > 0, // asignaciones
    total > 0, // automatizaciones generadas
    total > 0 && (week.pendingReminders || 0) === 0, // todo programado/enviado
  ]
  return Math.round((steps.filter(Boolean).length / steps.length) * 100)
}

const emptyForm = { weekStartDate: '', meetingDate: '', meetingTime: '', congregationName: '', notes: '' }

export default function SemanasPage() {
  const router = useRouter()
  const [weeks, setWeeks] = useState<MeetingWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<MeetingWeek | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmArchive, setConfirmArchive] = useState<MeetingWeek | null>(null)
  const [archiving, setArchiving] = useState(false)

  async function load() {
    try {
      const res = await api('/api/meeting-weeks')
      if (res.ok) setWeeks(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowForm(true)
  }

  function openEdit(w: MeetingWeek) {
    setEditing(w)
    setForm({
      weekStartDate: w.weekStartDate.split('T')[0],
      meetingDate: w.meetingDate.split('T')[0],
      meetingTime: w.meetingTime,
      congregationName: w.congregationName || '',
      notes: w.notes || '',
    })
    setError('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body: any = {
        weekStartDate: `${form.weekStartDate}T00:00:00.000Z`,
        meetingDate: `${form.meetingDate}T00:00:00.000Z`,
        meetingTime: form.meetingTime,
      }
      if (form.congregationName) body.congregationName = form.congregationName
      if (form.notes) body.notes = form.notes

      const url = editing ? `/api/meeting-weeks/${editing.id}` : '/api/meeting-weeks'
      const method = editing ? 'PUT' : 'POST'
      const res = await api(url, { method, body: JSON.stringify(body) })
      if (res.ok) {
        setShowForm(false)
        await load()
      } else {
        const data = await res.json()
        setError(data.error || 'Error al guardar')
      }
    } catch { setError('Error de conexion') } finally { setSaving(false) }
  }

  // A week with assignments or generated reminders is archived (history preserved),
  // never hard-deleted. Only empty drafts are removed.
  function weekHasHistory(w: MeetingWeek): boolean {
    return (w._count?.assignments || 0) > 0 || (w.totalReminders || 0) > 0
  }

  async function handleArchive() {
    if (!confirmArchive) return
    setArchiving(true)
    try {
      const res = await api(`/api/meeting-weeks/${confirmArchive.id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setConfirmArchive(null)
        await load()
      } else {
        const data = await res.json()
        setError(data.error || 'No se pudo completar la accion')
        setConfirmArchive(null)
      }
    } catch { setConfirmArchive(null) } finally { setArchiving(false) }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-silver-mist rounded-pill" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-white rounded-card" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Semanas de reunion</h1>
          <p className="text-sm text-graphite mt-1">Detalle y asignaciones de cada semana.</p>
        </div>
        <button onClick={openCreate} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">
          Nueva semana
        </button>
      </div>

      {/* Recommended-flow hint: weeks are normally generated from a monthly program. */}
      <div className="bg-fog rounded-card px-5 py-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-azure flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-sm text-graphite">
          El camino recomendado es generar las semanas desde un{' '}
          <Link href="/dashboard/programas" className="text-azure font-medium hover:underline">programa mensual</Link>.
          Crear una semana aqui manualmente es una opcion avanzada para casos puntuales.
        </p>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-card p-7 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">{editing ? 'Editar semana' : 'Nueva semana'}</h2>
            {error && <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-xl">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Inicio de semana</label>
                <input type="date" required value={form.weekStartDate} onChange={(e) => setForm({ ...form, weekStartDate: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Fecha de reunion</label>
                <input type="date" required value={form.meetingDate} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Hora de reunion</label>
                <input type="time" required value={form.meetingTime} onChange={(e) => setForm({ ...form, meetingTime: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Congregacion</label>
                <input type="text" value={form.congregationName} onChange={(e) => setForm({ ...form, congregationName: e.target.value })} placeholder="Nombre de congregacion" className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Notas</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="text-sm font-medium text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Archive / Delete Confirmation Modal */}
      {confirmArchive && (() => {
        const hasHistory = weekHasHistory(confirmArchive)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setConfirmArchive(null)}>
            <div className="bg-white rounded-card p-7 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-fog flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-ink tracking-tight">{hasHistory ? 'Archivar semana' : 'Eliminar semana'}</h2>
              </div>
              <p className="text-sm text-graphite mb-2">
                Semana del <strong className="text-ink">{formatDateShort(confirmArchive.weekStartDate)}</strong>.
              </p>
              {hasHistory ? (
                <p className="text-sm text-graphite mb-4">
                  Esta semana tiene asignaciones o automatizaciones, por lo que se <strong className="text-ink">archivara</strong> y
                  se conservara todo el historial. No se borrara ningun mensaje enviado.
                </p>
              ) : (
                <p className="text-sm text-graphite mb-4">
                  Esta semana esta vacia (sin asignaciones ni automatizaciones), por lo que se eliminara de forma permanente.
                </p>
              )}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className={`${hasHistory ? 'bg-graphite' : 'bg-red-400'} text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50`}
                >
                  {archiving ? 'Procesando...' : hasHistory ? 'Archivar' : 'Eliminar'}
                </button>
                <button
                  onClick={() => setConfirmArchive(null)}
                  className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Cards */}
      {weeks.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <svg className="w-10 h-10 text-graphite/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
          </svg>
          <p className="text-graphite text-sm">No hay semanas todavia</p>
          <p className="text-graphite/70 text-xs mt-1">Genera las semanas desde un programa mensual o crea una manualmente.</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Link href="/dashboard/programas" className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">
              Ir a programas
            </Link>
            <button onClick={openCreate} className="text-graphite text-sm font-medium px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
              Nueva semana
            </button>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {weeks.map((w) => {
            const meta = STATUS_META[w.status] || { label: w.status, className: 'bg-fog text-graphite' }
            const pct = completion(w)
            const dimmed = w.status === 'ARCHIVED' || w.status === 'CANCELLED'
            const hasHistory = weekHasHistory(w)
            return (
              <div
                key={w.id}
                className={`bg-white rounded-card p-5 sm:p-7 cursor-pointer hover:bg-fog/30 transition-colors ${dimmed ? 'opacity-70' : ''}`}
                onClick={() => router.push(`/dashboard/semanas/${w.id}`)}
              >
                {/* Program + status */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs text-graphite truncate">{w.monthlySchedule?.name || 'Sin programa'}</span>
                  <span className={`text-[11px] font-medium px-2.5 py-1 rounded-pill flex-shrink-0 ${meta.className}`}>{meta.label}</span>
                </div>

                {/* Title */}
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-5 h-5 text-graphite flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  <span className="text-sm font-semibold text-ink">Semana del {formatDateShort(w.weekStartDate)}</span>
                </div>
                <p className="text-sm text-graphite">Reunion: {formatDate(w.meetingDate)} a las {w.meetingTime}</p>
                {w.congregationName && <p className="text-xs text-graphite mt-1">{w.congregationName}</p>}

                {/* Completion bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-graphite">Completitud</span>
                    <span className="text-xs font-medium text-ink">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-fog rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-azure'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="bg-fog rounded-xl py-2">
                    <p className="text-sm font-semibold text-ink">{w._count?.assignments || 0}</p>
                    <p className="text-[11px] text-graphite">Asignaciones</p>
                  </div>
                  <div className="bg-fog rounded-xl py-2">
                    <p className="text-sm font-semibold text-ink">{w.pendingReminders || 0}</p>
                    <p className="text-[11px] text-graphite">Pendientes</p>
                  </div>
                  <div className="bg-fog rounded-xl py-2">
                    <p className="text-sm font-semibold text-ink">{w.sentReminders || 0}</p>
                    <p className="text-[11px] text-graphite">Enviadas</p>
                  </div>
                </div>
                {(w.failedReminders || 0) > 0 && (
                  <p className="text-xs text-red-600 mt-2">{w.failedReminders} automatizaciones con error</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-silver-mist">
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/semanas/${w.id}`) }}
                    className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-azure/5 transition-colors"
                  >
                    Ver detalle
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(w) }}
                    className="text-graphite text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-fog transition-colors"
                  >
                    Editar
                  </button>
                  {w.status !== 'ARCHIVED' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmArchive(w) }}
                      className={`text-xs font-medium px-3 py-1.5 rounded-pill transition-colors ${hasHistory ? 'text-graphite hover:bg-fog' : 'text-red-600 hover:bg-red-50'}`}
                    >
                      {hasHistory ? 'Archivar' : 'Eliminar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
