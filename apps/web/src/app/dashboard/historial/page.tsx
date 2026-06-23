'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface MessageLog {
  id: string
  createdAt: string
  sentAt: string | null
  phone: string
  messageType: string | null
  messageBody: string
  status: string
  errorMessage: string | null
  publisher: { id: string; fullName: string; displayName: string | null } | null
  assignment: { id: string; title: string } | null
}

const statusConfig: Record<string, { label: string; className: string }> = {
  SENT: { label: 'Enviado', className: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Fallido', className: 'bg-red-50 text-red-700' },
  SKIPPED: { label: 'Omitido', className: 'bg-amber-50 text-amber-700' },
}

export default function HistorialPage() {
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [publisherFilter, setPublisherFilter] = useState('')

  async function load() {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (publisherFilter) params.set('publisherId', publisherFilter)
      const query = params.toString() ? `?${params.toString()}` : ''
      const res = await api(`/api/message-logs${query}`)
      if (res.ok) setLogs(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [statusFilter])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-silver-mist rounded-pill" />
        <div className="h-64 bg-white rounded-card" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Historial de mensajes</h1>
        <select value={statusFilter} onChange={(e) => { setLoading(true); setStatusFilter(e.target.value) }} className="px-4 py-2.5 border border-silver-mist rounded-pill text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-azure/30">
          <option value="">Todos los estados</option>
          <option value="SENT">Enviado</option>
          <option value="FAILED">Fallido</option>
          <option value="SKIPPED">Omitido</option>
        </select>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
          <svg className="w-10 h-10 text-graphite/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p className="text-graphite text-sm">No hay mensajes en el historial</p>
        </div>
      ) : (
        <div className="bg-white rounded-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-silver-mist">
                  <th className="text-left px-7 py-4 font-medium text-graphite">Fecha</th>
                  <th className="text-left px-7 py-4 font-medium text-graphite">Destinatario</th>
                  <th className="text-left px-7 py-4 font-medium text-graphite">Tipo</th>
                  <th className="text-left px-7 py-4 font-medium text-graphite">Estado</th>
                  <th className="text-left px-7 py-4 font-medium text-graphite">Telefono</th>
                  <th className="text-left px-7 py-4 font-medium text-graphite">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-silver-mist last:border-0">
                    <td className="px-7 py-4 text-ink whitespace-nowrap">
                      {new Date(log.sentAt || log.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-7 py-4 text-ink font-medium">
                      {log.publisher?.displayName || log.publisher?.fullName || '—'}
                    </td>
                    <td className="px-7 py-4 text-graphite">{log.messageType || '—'}</td>
                    <td className="px-7 py-4">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-pill ${statusConfig[log.status]?.className ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusConfig[log.status]?.label ?? log.status}
                      </span>
                    </td>
                    <td className="px-7 py-4 text-graphite">{log.phone}</td>
                    <td className="px-7 py-4 text-graphite max-w-[200px] truncate" title={log.messageBody}>
                      {log.messageBody?.substring(0, 50) || '—'}{log.messageBody && log.messageBody.length > 50 ? '...' : ''}
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
