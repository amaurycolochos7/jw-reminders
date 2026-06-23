'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface MeetingWeek {
  id: string
  weekStartDate: string
  meetingDate: string
  meetingTime: string
  congregationName: string | null
  notes: string | null
  _count?: { assignments: number }
}

const emptyForm = { weekStartDate: '', meetingDate: '', meetingTime: '', congregationName: '', notes: '' }

export default function SemanasPage() {
  const [weeks, setWeeks] = useState<MeetingWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<MeetingWeek | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
        <button onClick={openCreate} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">
          Nueva semana
        </button>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-card p-7 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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

      {/* Cards */}
      {weeks.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <svg className="w-10 h-10 text-graphite/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
          </svg>
          <p className="text-graphite text-sm">No hay semanas registradas</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {weeks.map((w) => (
            <div key={w.id} className="bg-white rounded-card p-7 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  <span className="text-sm font-medium text-ink">
                    Semana del {new Date(w.weekStartDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                <button onClick={() => openEdit(w)} className="text-xs text-azure opacity-0 group-hover:opacity-100 transition-opacity">Editar</button>
              </div>
              <p className="text-sm text-graphite">
                Reunion: {new Date(w.meetingDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} a las {w.meetingTime}
              </p>
              {w.congregationName && <p className="text-xs text-graphite mt-1">{w.congregationName}</p>}
              <p className="text-xs text-graphite mt-1">{w._count?.assignments || 0} asignaciones</p>
              {w.notes && <p className="text-xs text-graphite/70 mt-2 italic">{w.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
