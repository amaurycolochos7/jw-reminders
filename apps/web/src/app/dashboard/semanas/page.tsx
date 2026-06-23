'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface MeetingWeek {
  id: string
  weekStartDate: string
  meetingDate: string
  meetingTime: string
  assignmentCount: number
}

export default function SemanasPage() {
  const [weeks, setWeeks] = useState<MeetingWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ weekStartDate: '', meetingDate: '', meetingTime: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const res = await api('/api/meeting-weeks')
      if (res.ok) setWeeks(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/api/meeting-weeks', { method: 'POST', body: JSON.stringify(form) })
      setShowForm(false)
      setForm({ weekStartDate: '', meetingDate: '', meetingTime: '' })
      await load()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-silver-mist rounded-pill" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-white rounded-card" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Semanas de reunion</h1>
        <button onClick={() => setShowForm(true)} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">
          Nueva semana
        </button>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-card p-7 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">Nueva semana</h2>
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

      {/* Cards */}
      {weeks.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <p className="text-graphite text-sm">No hay semanas registradas</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {weeks.map((w) => (
            <div key={w.id} className="bg-white rounded-card p-7">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <span className="text-sm font-medium text-ink">Semana del {w.weekStartDate}</span>
              </div>
              <p className="text-sm text-graphite">Reunion: {w.meetingDate} a las {w.meetingTime}</p>
              <p className="text-sm text-graphite mt-1">{w.assignmentCount} asignaciones</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
