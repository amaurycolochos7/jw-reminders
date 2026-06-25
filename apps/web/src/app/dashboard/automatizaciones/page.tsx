'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Delivery {
  id: string
  reminderType: string
  recipientRole: string
  status: string
  localDate: string
  localTime: string
  publisher: { fullName: string; displayName: string | null }
  assignment: {
    title: string
    assignmentNumber: number
    meetingWeek: {
      meetingDate: string
      meetingTime: string
      monthlySchedule: { name: string } | null
    }
  }
  lastAttempt: { errorMessage: string | null } | null
}

interface Group {
  label: string
  localDate: string
  deliveries: Delivery[]
}

interface ResponseData {
  summary: Record<string, number>
  groups: Group[]
  range: { timezone: string }
}

interface Publisher {
  id: string
  fullName: string
  displayName: string | null
}

interface MonthlySchedule {
  id: string
  name: string
  status: string
}

const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  QUEUED: 'En cola',
  SENDING: 'Enviando',
  SENT: 'Enviado',
  FAILED: 'Fallido',
  SKIPPED: 'Omitido',
  CANCELLED: 'Cancelado',
  DEAD: 'Agotado',
}

const statusClasses: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  QUEUED: 'bg-amber-50 text-amber-700',
  SENDING: 'bg-fog text-azure',
  SENT: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  SKIPPED: 'bg-fog text-graphite',
  CANCELLED: 'bg-red-50 text-red-600',
  DEAD: 'bg-red-50 text-red-700',
}

const typeLabels: Record<string, string> = {
  INITIAL_NOTICE: 'Aviso inicial',
  SEVEN_DAYS_BEFORE: '7 dias antes',
  THREE_DAYS_BEFORE: '3 dias antes',
  ONE_DAY_BEFORE: '1 dia antes',
  SAME_DAY: 'Mismo dia',
  CHANGE_NOTICE: 'Cambio',
  CANCELLATION_NOTICE: 'Cancelacion',
}

export default function AutomatizacionesPage() {
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const [range, setRange] = useState(initialParams.get('range') || 'today')
  const [status, setStatus] = useState(initialParams.get('status') || '')
  const [role, setRole] = useState('')
  const [publisherId, setPublisherId] = useState('')
  const [monthlyScheduleId, setMonthlyScheduleId] = useState('')
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [programs, setPrograms] = useState<MonthlySchedule[]>([])
  const [data, setData] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('range', range)
      if (status) params.set('status', status)
      if (role) params.set('role', role)
      if (publisherId) params.set('publisherId', publisherId)
      if (monthlyScheduleId) params.set('monthlyScheduleId', monthlyScheduleId)
      const res = await api(`/api/automation-center?${params.toString()}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [range, status, role, publisherId, monthlyScheduleId])

  useEffect(() => {
    async function loadFilters() {
      const [publisherRes, programRes] = await Promise.all([
        api('/api/publishers'),
        api('/api/monthly-schedules'),
      ])
      if (publisherRes.ok) setPublishers(await publisherRes.json())
      if (programRes.ok) setPrograms(await programRes.json())
    }
    loadFilters()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Automatizaciones</h1>
        <p className="text-sm text-graphite mt-1">Agenda global de mensajes programados, enviados y fallidos.</p>
      </div>

      <div className="bg-white rounded-card p-5 sm:p-7">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Rango</label>
            <select value={range} onChange={(e) => setRange(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="today">Hoy</option>
              <option value="tomorrow">Manana</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Estado</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="sent">Enviadas</option>
              <option value="failed">Fallidas</option>
              <option value="cancelled">Canceladas</option>
              <option value="dead">Agotadas</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todos</option>
              <option value="assigned">Asignado</option>
              <option value="companion">Acompanante</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Publicador</label>
            <select value={publisherId} onChange={(e) => setPublisherId(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todos</option>
              {publishers.map((publisher) => (
                <option key={publisher.id} value={publisher.id}>{publisher.displayName || publisher.fullName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Programa</label>
            <select value={monthlyScheduleId} onChange={(e) => setMonthlyScheduleId(e.target.value)} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white">
              <option value="">Todos</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>{program.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['pending', 'sent', 'failed', 'cancelled'] as const).map((key) => (
            <div key={key} className="bg-white rounded-card p-5">
              <p className="text-xs text-graphite uppercase tracking-wide">{key}</p>
              <p className="text-2xl font-semibold text-ink mt-1">{data.summary[key] || 0}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="h-48 bg-white rounded-card animate-pulse" />
      ) : !data || data.groups.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <p className="text-sm text-graphite">No hay entregas para este filtro</p>
        </div>
      ) : (
        <div className="space-y-5">
          {data.groups.map((group) => (
            <section key={group.localDate} className="bg-white rounded-card overflow-hidden">
              <div className="px-5 py-4 border-b border-silver-mist flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{group.label}</h2>
                  <p className="text-xs text-graphite">{group.localDate} / {data.range.timezone}</p>
                </div>
                <span className="text-xs text-graphite">{group.deliveries.length} entregas</span>
              </div>
              <div className="divide-y divide-silver-mist">
                {group.deliveries.map((delivery) => (
                  <div key={delivery.id} className="px-5 py-4 grid grid-cols-1 lg:grid-cols-[90px_1fr_180px_120px] gap-3 lg:items-center">
                    <div className="text-sm font-semibold text-ink">{delivery.localTime}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{delivery.publisher.displayName || delivery.publisher.fullName}</p>
                      <p className="text-xs text-graphite mt-0.5 truncate">
                        {delivery.assignment.assignmentNumber}. {delivery.assignment.title} / {typeLabels[delivery.reminderType] || delivery.reminderType}
                      </p>
                      {delivery.lastAttempt?.errorMessage && <p className="text-xs text-red-600 mt-1">{delivery.lastAttempt.errorMessage}</p>}
                    </div>
                    <div className="text-xs text-graphite">
                      <p>{delivery.assignment.meetingWeek.monthlySchedule?.name || 'Sin programa'}</p>
                      <p>{delivery.recipientRole === 'COMPANION' ? 'Acompanante' : 'Asignado'}</p>
                    </div>
                    <div>
                      <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-pill ${statusClasses[delivery.status] || 'bg-fog text-graphite'}`}>
                        {statusLabels[delivery.status] || delivery.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
