'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Config {
  timezone: string
  sendHour: string
  congregationName: string
}

interface WhatsAppStatus {
  status: 'connected' | 'waiting_qr' | 'disconnected'
  phone?: string
}

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Config>({ timezone: '', sendHour: '', congregationName: '' })
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({ status: 'disconnected' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [configRes, statusRes] = await Promise.all([
          api('/api/config'),
          api('/api/whatsapp/status'),
        ])
        if (configRes.ok) setConfig(await configRes.json())
        if (statusRes.ok) setWaStatus(await statusRes.json())
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const res = await api('/api/config', { method: 'PUT', body: JSON.stringify(config) })
      if (res.ok) setSaved(true)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  const statusColor = waStatus.status === 'connected' ? 'bg-emerald-500' : waStatus.status === 'waiting_qr' ? 'bg-amber-400' : 'bg-red-400'
  const statusLabel = waStatus.status === 'connected' ? 'Conectado' : waStatus.status === 'waiting_qr' ? 'Esperando QR' : 'Desconectado'

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-silver-mist rounded-pill" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-64 bg-white rounded-card" />
          <div className="h-40 bg-white rounded-card" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink tracking-tight">Configuracion</h1>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Settings form */}
        <div className="bg-white rounded-card p-7">
          <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">Ajustes generales</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Nombre de la congregacion</label>
              <input type="text" value={config.congregationName} onChange={(e) => setConfig({ ...config, congregationName: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Zona horaria</label>
              <input type="text" value={config.timezone} onChange={(e) => setConfig({ ...config, timezone: e.target.value })} placeholder="America/Mexico_City" className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Hora de envio</label>
              <input type="time" value={config.sendHour} onChange={(e) => setConfig({ ...config, sendHour: e.target.value })} className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
            </div>
            <div className="pt-2">
              <button type="submit" disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {saved && <span className="ml-3 text-sm text-emerald-600">Guardado correctamente</span>}
            </div>
          </form>
        </div>

        {/* WhatsApp status */}
        <div className="bg-white rounded-card p-7">
          <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">Estado de WhatsApp</h2>
          <div className="flex items-center gap-3 mb-4">
            <span className={`w-3 h-3 rounded-full ${statusColor}`} />
            <span className="text-sm font-medium text-ink">{statusLabel}</span>
          </div>
          {waStatus.phone && (
            <p className="text-sm text-graphite">Numero conectado: {waStatus.phone}</p>
          )}
          <div className="mt-6 p-4 bg-fog rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-graphite flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="text-sm text-graphite">Para reconectar WhatsApp, reinicia el servicio desde el servidor y escanea el codigo QR nuevamente.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
