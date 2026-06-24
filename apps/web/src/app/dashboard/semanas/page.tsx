'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import CompletionStatus from '@/components/CompletionStatus'

interface MeetingWeek {
  id: string
  weekStartDate: string
  meetingDate: string
  meetingTime: string
  congregationName: string | null
  notes: string | null
  _count?: { assignments: number }
  totalReminders?: number
}

/**
 * Formats an ISO date string without timezone shift.
 * "2026-06-22T00:00:00.000Z" → "22 jun 2026"
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
  const [confirmDelete, setConfirmDelete] = useState<MeetingWeek | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [whatsappConnected, setWhatsappConnected] = useState(false)

  async function load() {
    try {
      const res = await api('/api/meeting-weeks')
      if (res.ok) setWeeks(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    async function loadWhatsappStatus() {
      try {
        const res = await api('/api/whatsapp/status')
        if (res.ok) {
          const data = await res.json()
          const st = (data.status || '').toUpperCase()
          setWhatsappConnected(st === 'READY')
        }
      } catch { /* ignore */ }
    }
    loadWhatsappStatus()
  }, [])

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

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const res = await api(`/api/meeting-weeks/${confirmDelete.id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setConfirmDelete(null)
        await load()
      } else {
        const data = await res.json()
        alert(data.error || 'No se pudo eliminar')
        setConfirmDelete(null)
      }
    } catch { setConfirmDelete(null) } finally { setDeleting(false) }
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

      {/* Create/Edit Modal */}
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

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-card p-7 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-ink tracking-tight">Eliminar semana</h2>
            </div>
            <p className="text-sm text-graphite mb-2">
              Vas a eliminar la semana del <strong className="text-ink">{formatDateShort(confirmDelete.weekStartDate)}</strong>.
            </p>
            {(confirmDelete._count?.assignments || 0) > 0 && (
              <p className="text-sm text-red-600 mb-4">
                Esta semana tiene {confirmDelete._count?.assignments} asignaciones que tambien se eliminaran.
              </p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-400 text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors"
              >
                Cancelar
              </button>
            </div>
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
          <button onClick={openCreate} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity mt-4">
            Nueva semana
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {weeks.map((w) => (
            <div
              key={w.id}
              className="bg-white rounded-card p-5 sm:p-7 cursor-pointer hover:bg-fog/30 transition-colors"
              onClick={() => router.push(`/dashboard/semanas/${w.id}`)}
            >
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-graphite" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <span className="text-sm font-medium text-ink">Semana del {formatDateShort(w.weekStartDate)}</span>
              </div>
              <p className="text-sm text-graphite">
                Reunion: {formatDate(w.meetingDate)} a las {w.meetingTime}
              </p>
              {w.congregationName && <p className="text-xs text-graphite mt-1">{w.congregationName}</p>}
              <p className="text-xs text-graphite mt-1">{w._count?.assignments || 0} asignaciones</p>
              {w.notes && <p className="text-xs text-graphite/70 mt-2 italic">{w.notes}</p>}

              {/* Completion Status */}
              <div className="mt-3">
                <CompletionStatus
                  hasAssignments={(w._count?.assignments || 0) > 0}
                  hasReminders={(w.totalReminders || 0) > 0}
                  whatsappConnected={whatsappConnected}
                />
              </div>

              {/* Actions - always visible */}
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
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(w) }}
                  className="text-red-600 text-xs font-medium px-3 py-1.5 rounded-pill hover:bg-red-50 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
