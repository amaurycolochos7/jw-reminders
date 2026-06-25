'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

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

function statusClass(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700',
    DRAFT: 'bg-amber-50 text-amber-700',
    ARCHIVED: 'bg-fog text-graphite',
    CANCELLED: 'bg-red-50 text-red-700',
  }
  return map[status] || 'bg-fog text-graphite'
}

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

  async function load() {
    try {
      const res = await api('/api/monthly-schedules')
      if (res.ok) setPrograms(await res.json())
    } finally {
      setLoading(false)
    }
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
    } finally {
      setSaving(false)
    }
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
    } finally {
      setGenerating(null)
    }
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
    } finally {
      setGeneratingWeeks(null)
    }
  }

  async function archiveProgram(id: string) {
    await api(`/api/monthly-schedules/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'ARCHIVED' }) })
    await load()
  }

  if (loading) {
    return <div className="h-40 bg-white rounded-card animate-pulse" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Programas mensuales</h1>
        <p className="text-sm text-graphite mt-1">Punto de partida recomendado: crea el programa del mes y genera sus semanas.</p>
      </div>

      <div className="bg-fog rounded-card px-5 py-4">
        <p className="text-sm text-graphite">
          Flujo recomendado: <span className="text-ink font-medium">Programa</span> &rarr; Generar semanas &rarr;{' '}
          <Link href="/dashboard/semanas" className="text-azure font-medium hover:underline">Revisar asignaciones</Link> &rarr; Generar automatizaciones &rarr;{' '}
          <Link href="/dashboard/automatizaciones" className="text-azure font-medium hover:underline">Centro de Automatizaciones</Link>.
        </p>
      </div>

      <div className="bg-white rounded-card p-5 sm:p-7 space-y-5">
        <form onSubmit={createProgram} className="grid grid-cols-1 md:grid-cols-[180px_120px_auto_1fr] gap-3 md:items-end">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Mes</label>
            <select value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })} className="px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Ano</label>
            <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm" />
          </div>
          <button disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill disabled:opacity-50">
            {saving ? 'Creando...' : 'Crear programa'}
          </button>
          {message && <p className="text-sm text-graphite md:justify-self-end md:self-center">{message}</p>}
        </form>

        <div className="border-t border-silver-mist pt-5 grid grid-cols-1 md:grid-cols-[180px_140px_1fr] gap-3 md:items-end">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Dia de reunion</label>
            <select value={weekForm.meetingDayOfWeek} onChange={(e) => setWeekForm({ ...weekForm, meetingDayOfWeek: Number(e.target.value) })} className="px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              {WEEK_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Hora</label>
            <input type="time" value={weekForm.meetingTime} onChange={(e) => setWeekForm({ ...weekForm, meetingTime: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm" />
          </div>
          <p className="text-sm text-graphite md:self-center">
            Estos datos se usan al generar las semanas del programa seleccionado.
          </p>
        </div>
      </div>

      {programs.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <p className="text-sm text-graphite">No hay programas mensuales todavia</p>
        </div>
      ) : (
        <div className="bg-white rounded-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-silver-mist">
                  <th className="text-left px-5 py-4 font-medium text-graphite">Programa</th>
                  <th className="text-left px-5 py-4 font-medium text-graphite">Estado</th>
                  <th className="text-left px-5 py-4 font-medium text-graphite">Semanas</th>
                  <th className="text-left px-5 py-4 font-medium text-graphite">Asignaciones</th>
                  <th className="text-left px-5 py-4 font-medium text-graphite">Entregas</th>
                  <th className="text-left px-5 py-4 font-medium text-graphite">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((program) => (
                  <tr key={program.id} className="border-b border-silver-mist last:border-0">
                    <td className="px-5 py-4 text-ink font-medium">{program.name}</td>
                    <td className="px-5 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-pill ${statusClass(program.status)}`}>{program.status}</span></td>
                    <td className="px-5 py-4 text-graphite">{program.weekCount}</td>
                    <td className="px-5 py-4 text-graphite">{program.assignmentCount}</td>
                    <td className="px-5 py-4 text-graphite">{program.deliveryCount}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => generateWeeks(program.id)} disabled={generatingWeeks === program.id || program.status === 'ARCHIVED'} className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-azure/5 disabled:opacity-50">
                          {generatingWeeks === program.id ? 'Generando...' : 'Generar semanas'}
                        </button>
                        <button onClick={() => generateAssignments(program.id)} disabled={generating === program.id || program.status === 'ARCHIVED'} className="text-azure text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-azure/5 disabled:opacity-50">
                          {generating === program.id ? 'Generando...' : 'Generar asignaciones'}
                        </button>
                        <Link href={`/dashboard/automatizaciones?range=month&monthlyScheduleId=${program.id}`} className="text-graphite text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-fog">
                          Ver agenda
                        </Link>
                        <button onClick={() => archiveProgram(program.id)} disabled={program.status === 'ARCHIVED'} className="text-graphite text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-fog disabled:opacity-50">
                          Archivar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
