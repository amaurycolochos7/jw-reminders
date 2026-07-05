'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import ConfirmModal from '@/components/ConfirmModal'

interface MonthlySchedule {
  id: string
  year: number
  month: number
  name: string
  status: string
  weekCount: number
  assignmentCount: number
  deliveryCount: number
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WEEK_DAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
]

function statusLabel(status: string) {
  const map: Record<string, string> = { ACTIVE: 'Activo', DRAFT: 'Borrador', COMPLETED: 'Completado', ARCHIVED: 'Archivado', CANCELLED: 'Cancelado' }
  return map[status] || status
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700',
    DRAFT: 'bg-amber-50 text-amber-700',
    COMPLETED: 'bg-azure/10 text-azure',
    ARCHIVED: 'bg-fog text-graphite',
    CANCELLED: 'bg-red-50 text-red-700',
  }
  return map[status] || 'bg-fog text-graphite'
}

// ─── Hero Illustration (CSS-based 3D-style) ──────────────
function ProgramIllustration() {
  return (
    <div className="relative w-44 h-44 lg:w-56 lg:h-56 flex-shrink-0">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-azure/20 to-azure/5" />
      {/* Calendar */}
      <div className="absolute top-5 left-5 w-20 h-24 bg-white rounded-xl shadow-lg border border-azure/10 transform -rotate-6">
        <div className="h-5 bg-azure rounded-t-xl flex items-center justify-center">
          <div className="flex gap-0.5">
            <div className="w-1 h-1 rounded-full bg-white/60" />
            <div className="w-1 h-1 rounded-full bg-white/60" />
            <div className="w-1 h-1 rounded-full bg-white/60" />
          </div>
        </div>
        <div className="p-2 space-y-1">
          <div className="grid grid-cols-5 gap-0.5">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-sm ${i === 7 ? 'bg-azure' : 'bg-azure/15'}`} />
            ))}
          </div>
        </div>
      </div>
      {/* Document/Program */}
      <div className="absolute top-3 right-4 w-18 h-22 bg-white rounded-xl shadow-lg border border-azure/10 transform rotate-6 p-2.5">
        <div className="h-2 w-10 bg-azure/30 rounded mb-2" />
        <div className="h-1.5 w-12 bg-azure/15 rounded mb-1" />
        <div className="h-1.5 w-9 bg-azure/15 rounded mb-1" />
        <div className="h-1.5 w-11 bg-azure/10 rounded mb-2" />
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/50" />
          <div className="h-1.5 w-6 bg-emerald-400/30 rounded" />
        </div>
      </div>
      {/* Checklist */}
      <div className="absolute bottom-5 right-5 w-22 h-20 bg-white rounded-xl shadow-lg border border-azure/10 transform rotate-3 p-2.5">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-3 h-3 rounded border-2 border-azure flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-azure rounded-sm" />
          </div>
          <div className="h-1.5 w-10 bg-azure/30 rounded" />
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-3 h-3 rounded border-2 border-azure flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-azure rounded-sm" />
          </div>
          <div className="h-1.5 w-8 bg-azure/20 rounded" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border-2 border-silver-mist" />
          <div className="h-1.5 w-9 bg-gray-200 rounded" />
        </div>
      </div>
      {/* Clock accent */}
      <div className="absolute bottom-7 left-7 w-10 h-10 bg-azure/10 rounded-full flex items-center justify-center">
        <svg className="w-5 h-5 text-azure" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    </div>
  )
}



// ─── Main Page ───────────────────────────────────────────
export default function ProgramasPage() {
  const now = new Date()
  const [programs, setPrograms] = useState<MonthlySchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [generatingWeeks, setGeneratingWeeks] = useState<string | null>(null)
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [weekForm, setWeekForm] = useState({ meetingDayOfWeek: 5, meetingTime: '19:00' })
  const [message, setMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<MonthlySchedule | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    try {
      const res = await api('/api/monthly-schedules')
      if (res.ok) setPrograms(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function createProgram(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const res = await api('/api/monthly-schedules', {
        method: 'POST',
        body: JSON.stringify({ year: Number(form.year), month: Number(form.month) }),
      })
      if (res.ok) {
        setMessage('Programa creado')
        await load()
      } else {
        const data = await res.json()
        setMessage(data.error || 'No se pudo crear el programa')
      }
    } finally { setSaving(false) }
  }

  async function generateAssignments(id: string) {
    setGenerating(id)
    setMessage('')
    try {
      const res = await api(`/api/monthly-schedules/${id}/generate-assignments`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setMessage(`${data.created || 0} asignaciones generadas en borrador`)
        await load()
      } else {
        setMessage(data.error || 'No se pudieron generar asignaciones')
      }
    } finally { setGenerating(null) }
  }

  async function generateWeeks(id: string) {
    setGeneratingWeeks(id)
    setMessage('')
    try {
      const res = await api(`/api/monthly-schedules/${id}/generate-weeks`, {
        method: 'POST',
        body: JSON.stringify({
          meetingDayOfWeek: Number(weekForm.meetingDayOfWeek),
          meetingTime: weekForm.meetingTime,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`${data.created || 0} semanas generadas`)
        await load()
      } else {
        setMessage(data.error || 'No se pudieron generar semanas')
      }
    } finally { setGeneratingWeeks(null) }
  }

  async function archiveProgram(id: string) {
    await api(`/api/monthly-schedules/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'ARCHIVED' }) })
    await load()
  }

  async function deleteProgram(id: string) {
    setDeleting(true)
    setMessage('')
    try {
      const res = await api(`/api/monthly-schedules/${id}?mode=delete`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage('Programa eliminado')
        setConfirmDelete(null)
        await load()
      } else {
        setMessage(data.error || 'No se pudo eliminar el programa')
        setConfirmDelete(null)
      }
    } catch {
      setMessage('Error de conexion')
      setConfirmDelete(null)
    } finally { setDeleting(false) }
  }


  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 animate-pulse">
        <div className="h-52 rounded-3xl bg-white" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-20 rounded-2xl bg-white" />
          <div className="h-20 rounded-2xl bg-white" />
          <div className="h-20 rounded-2xl bg-white" />
          <div className="h-20 rounded-2xl bg-white" />
        </div>
        <div className="h-48 rounded-3xl bg-white" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">

      {/* ─── Hero Card ─── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-white to-azure/5 border border-silver-mist/60 shadow-sm">
        <div className="flex flex-col lg:flex-row items-center gap-6 p-7 sm:p-9">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-azure uppercase tracking-wider mb-2">Gestion mensual</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight leading-tight">
              Programas mensuales
            </h1>
            <p className="mt-3 text-sm text-graphite leading-relaxed max-w-lg">
              Crea el programa del mes, genera sus semanas y revisa las asignaciones antes de enviar recordatorios.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="#crear" className="inline-flex items-center gap-2 bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                Crear programa
              </a>
              <Link href="/dashboard/semanas" className="inline-flex items-center gap-2 bg-white text-ink text-sm font-medium px-5 py-2.5 rounded-xl border border-silver-mist hover:bg-fog transition-colors">
                Revisar asignaciones
              </Link>
              <Link href="/dashboard/automatizaciones" className="inline-flex items-center gap-2 text-azure text-sm font-medium px-4 py-2.5 hover:opacity-80 transition-opacity">
                Ver automatizaciones
              </Link>
            </div>
          </div>
          <ProgramIllustration />
        </div>
      </section>



      {/* ─── Message feedback ─── */}
      {message && (
        <div className="rounded-2xl px-5 py-3 text-sm bg-azure/5 text-azure border border-azure/20">{message}</div>
      )}

      {/* ─── Create Form ─── */}
      <section id="crear" className="bg-white rounded-3xl border border-silver-mist/60 shadow-sm p-6 sm:p-8">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-ink">Crear nuevo programa</h2>
          <p className="text-xs text-graphite">Selecciona el mes para organizar las reuniones.</p>
        </div>

        <form onSubmit={createProgram} className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-graphite mb-1.5">Mes</label>
            <select value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-azure/30">
              {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-graphite mb-1.5">Año</label>
            <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className="w-40 px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
          </div>
          <button type="submit" disabled={saving} className="bg-azure text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Creando...' : 'Crear programa'}
          </button>
        </form>

        <p className="mt-4 text-xs text-graphite">El dia y hora de reunion se configuran al generar las semanas del programa.</p>
      </section>

      {/* ─── Programs List ─── */}
      {programs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide px-1">Programas creados</h2>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {programs.map((program) => (
              <div key={program.id} className="bg-white rounded-2xl border border-silver-mist/60 shadow-sm p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <p className="text-sm font-semibold text-ink">{program.name}</p>
                  <span className={`text-[11px] font-medium px-2.5 py-1 rounded-pill flex-shrink-0 ${statusClass(program.status)}`}>{statusLabel(program.status)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-fog rounded-xl py-2.5">
                    <p className="text-sm font-bold text-ink">{program.weekCount}</p>
                    <p className="text-[11px] text-graphite">Semanas</p>
                  </div>
                  <div className="bg-fog rounded-xl py-2.5">
                    <p className="text-sm font-bold text-ink">{program.assignmentCount}</p>
                    <p className="text-[11px] text-graphite">Asignaciones</p>
                  </div>
                  <div className="bg-fog rounded-xl py-2.5">
                    <p className="text-sm font-bold text-ink">{program.deliveryCount}</p>
                    <p className="text-[11px] text-graphite">Entregas</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-silver-mist/60 flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/programas/${program.id}`} className="bg-azure text-white text-xs font-medium px-3.5 py-1.5 rounded-xl hover:opacity-90 transition-opacity">
                    Ver detalle
                  </Link>
                  <Link href={`/dashboard/automatizaciones?range=month&monthlyScheduleId=${program.id}`} className="text-graphite text-xs font-medium px-3 py-1.5 rounded-xl hover:bg-fog transition-colors">
                    Agenda
                  </Link>
                  <button onClick={() => setConfirmDelete(program)} className="text-red-600 text-xs font-medium px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors">
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block bg-white rounded-2xl border border-silver-mist/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-silver-mist/60 bg-fog/50">
                    <th className="text-left px-6 py-4 font-medium text-graphite text-xs uppercase tracking-wide">Programa</th>
                    <th className="text-left px-6 py-4 font-medium text-graphite text-xs uppercase tracking-wide">Estado</th>
                    <th className="text-center px-4 py-4 font-medium text-graphite text-xs uppercase tracking-wide">Semanas</th>
                    <th className="text-center px-4 py-4 font-medium text-graphite text-xs uppercase tracking-wide">Asignaciones</th>
                    <th className="text-center px-4 py-4 font-medium text-graphite text-xs uppercase tracking-wide">Entregas</th>
                    <th className="text-left px-6 py-4 font-medium text-graphite text-xs uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((program) => (
                    <tr key={program.id} className="border-b border-silver-mist/40 last:border-0 hover:bg-fog/40 transition-colors">
                      <td className="px-6 py-4 text-ink font-medium">{program.name}</td>
                      <td className="px-6 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-pill ${statusClass(program.status)}`}>{statusLabel(program.status)}</span></td>
                      <td className="px-4 py-4 text-center text-graphite">{program.weekCount}</td>
                      <td className="px-4 py-4 text-center text-graphite">{program.assignmentCount}</td>
                      <td className="px-4 py-4 text-center text-graphite">{program.deliveryCount}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/dashboard/programas/${program.id}`} className="bg-azure text-white text-xs font-medium px-3.5 py-1.5 rounded-xl hover:opacity-90 transition-opacity">
                            Ver detalle
                          </Link>
                          <Link href={`/dashboard/automatizaciones?range=month&monthlyScheduleId=${program.id}`} className="text-graphite text-xs font-medium px-3 py-1.5 rounded-xl hover:bg-fog transition-colors">
                            Agenda
                          </Link>
                          <button onClick={() => setConfirmDelete(program)} className="text-red-600 text-xs font-medium px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors">
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title="Eliminar programa"
        description={confirmDelete ? <>Se eliminara <strong className="text-ink">de forma permanente</strong> el programa <strong className="text-ink">{confirmDelete.name}</strong> junto con todas sus semanas, asignaciones, automatizaciones y recordatorios. Esta accion no se puede deshacer.</> : null}
        confirmLabel="Eliminar definitivamente"
        tone="danger"
        loading={deleting}
        onConfirm={() => confirmDelete && deleteProgram(confirmDelete.id)}
        onCancel={() => !deleting && setConfirmDelete(null)}
      />
    </div>
  )
}
