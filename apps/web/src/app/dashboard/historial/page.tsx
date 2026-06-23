'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface MessageLog {
  id: string
  sentAt: string
  recipientName: string
  type: string
  status: 'sent' | 'delivered' | 'failed' | 'pending'
  phone: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  sent: { label: 'Enviado', className: 'bg-blue-50 text-blue-700' },
  delivered: { label: 'Entregado', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Fallido', className: 'bg-red-50 text-red-700' },
  pending: { label: 'Pendiente', className: 'bg-amber-50 text-amber-700' },
}

export default function HistorialPage() {
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  async function load() {
    try {
      const query = filter ? `?status=${filter}` : ''
      const res = await api(`/api/message-logs${query}`)
      if (res.ok) setLogs(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter])

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
        <select value={filter} onChange={(e) => { setLoading(true); setFilter(e.target.value) }} className="px-4 py-2.5 border border-silver-mist rounded-pill text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-azure/30">
          <option value="">Todos los estados</option>
          <option value="sent">Enviado</option>
          <option value="delivered">Entregado</option>
          <option value="failed">Fallido</option>
          <option value="pending">Pendiente</option>
        </select>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white rounded-card p-7 text-center py-16">
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
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-silver-mist last:border-0">
                    <td className="px-7 py-4 text-ink">{new Date(log.sentAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-7 py-4 text-ink font-medium">{log.recipientName}</td>
                    <td className="px-7 py-4 text-graphite">{log.type}</td>
                    <td className="px-7 py-4">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-pill ${statusConfig[log.status]?.className ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusConfig[log.status]?.label ?? log.status}
                      </span>
                    </td>
                    <td className="px-7 py-4 text-graphite">{log.phone}</td>
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
