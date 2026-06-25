'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Config {
  timezone: string
  sendHour: string
  congregationName: string
  testMode: string
  testPhone: string
}

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Config>({ timezone: '', sendHour: '', congregationName: '', testMode: '', testPhone: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await api('/api/config')
        if (res.ok) {
          const data = await res.json()
          setConfig({
            timezone: data.TIMEZONE || data.timezone || '',
            sendHour: data.REMINDER_SEND_HOUR || data.sendHour || '',
            congregationName: data.CONGREGATION_NAME || data.congregationName || '',
            testMode: data.TEST_MODE || data.testMode || 'true',
            testPhone: data.TEST_PHONE || data.testPhone || '',
          })
        }
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const body = {
        TIMEZONE: config.timezone,
        REMINDER_SEND_HOUR: config.sendHour,
        CONGREGATION_NAME: config.congregationName,
        TEST_MODE: config.testMode,
        TEST_PHONE: config.testPhone,
      }
      const res = await api('/api/config', { method: 'PUT', body: JSON.stringify(body) })
      if (res.ok) setSaved(true)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

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
      <h1 className="text-2xl font-semibold text-ink tracking-tight">Configuracion</h1>

      <div className="bg-white rounded-card p-7 max-w-xl">
        <h2 className="text-lg font-semibold text-ink tracking-tight mb-5">Ajustes generales</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Nombre de la congregacion</label>
            <input type="text" value={config.congregationName} onChange={(e) => setConfig({ ...config, congregationName: e.target.value })} placeholder="Congregacion Central" className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Zona horaria</label>
            <input type="text" value={config.timezone} onChange={(e) => setConfig({ ...config, timezone: e.target.value })} placeholder="America/Mexico_City" className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Hora de envio de recordatorios</label>
            <input type="text" value={config.sendHour} onChange={(e) => setConfig({ ...config, sendHour: e.target.value })} placeholder="9" className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
            <p className="text-xs text-graphite mt-1">Hora en formato 24h (0-23)</p>
          </div>

          <div className="border-t border-silver-mist pt-4 mt-4">
            <h3 className="text-sm font-semibold text-ink mb-3">Modo de prueba</h3>
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input type="checkbox" checked={config.testMode === 'true'} onChange={(e) => setConfig({ ...config, testMode: e.target.checked ? 'true' : 'false' })} className="w-4 h-4 rounded border-silver-mist text-azure focus:ring-azure/30" />
                Modo prueba activo
              </label>
            </div>
            <p className="text-xs text-graphite mb-3">Cuando esta activo, todos los mensajes se envian al numero de prueba en lugar del numero real del publicador. Los cambios se aplican en el siguiente ciclo del worker (hasta 10 min), sin necesidad de redeploy.</p>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Numero de prueba</label>
              <input type="tel" value={config.testPhone} onChange={(e) => setConfig({ ...config, testPhone: e.target.value })} placeholder="5219611234567" className="w-full px-4 py-2.5 border border-silver-mist rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30" />
            </div>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={saving} className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {saved && <span className="ml-3 text-sm text-emerald-600">Guardado correctamente</span>}
          </div>
        </form>
      </div>
    </div>
  )
}
