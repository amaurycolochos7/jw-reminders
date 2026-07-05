'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Template { id: string; type: string; title: string; connectedToSend: boolean }
interface Publisher { id: string; fullName: string; displayName: string | null }
interface SendState { canSend: boolean; paused: boolean; manualPaused: boolean; autoPaused: boolean; pauseReason: string | null; whatsappStatus: string }

export default function EnviarPage() {
  const [prefix, setPrefix] = useState('52')

  function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '')
    return prefix.replace(/\D/g, '') + digits
  }

  const [tab, setTab] = useState<'manual' | 'prueba'>('prueba')
  const [templates, setTemplates] = useState<Template[]>([])
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [sendState, setSendState] = useState<SendState | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // Manual
  const [mPhone, setMPhone] = useState('')
  const [mText, setMText] = useState('')
  const [mConfirm, setMConfirm] = useState(false)
  // Prueba
  const [tTemplate, setTTemplate] = useState('')
  const [tPublisher, setTPublisher] = useState('')
  const [tPhone, setTPhone] = useState('')
  const [tPreview, setTPreview] = useState<{ rendered: string; templateType: string; version: number; variables: Record<string, string> } | null>(null)
  const [busy, setBusy] = useState('')

  async function refreshState() {
    const r = await api('/api/whatsapp/send-state'); if (r.ok) setSendState(await r.json())
  }
  useEffect(() => {
    api('/api/message-templates').then(async (r) => { if (r.ok) { const d: Template[] = await r.json(); setTemplates(d.filter((t) => t.connectedToSend)); if (d[0]) setTTemplate(d.find((t) => t.connectedToSend)?.id || '') } })
    api('/api/publishers').then(async (r) => { if (r.ok) { const d = await r.json(); setPublishers(Array.isArray(d) ? d : (d.items ?? [])) } })
    refreshState(); const i = setInterval(refreshState, 5000); return () => clearInterval(i)
  }, [])

  async function sendManual() {
    setBusy('manual'); setNotice(null)
    const phone = normalizePhone(mPhone)
    try {
      const r = await api('/api/whatsapp/manual-send', { method: 'POST', body: JSON.stringify({ phone, message: mText }) })
      const d = await r.json()
      setNotice({ ok: r.ok && d.sent, text: d.sent ? 'Mensaje manual enviado.' : `No se envió: ${d.reason || d.error}` })
      if (d.sent) { setMText(''); setMConfirm(false) }
    } finally { setBusy('') }
  }

  async function previewTest() {
    setBusy('preview'); setNotice(null)
    const r = await api('/api/whatsapp/test-template/preview', { method: 'POST', body: JSON.stringify({ templateId: tTemplate, publisherId: tPublisher || undefined }) })
    if (r.ok) setTPreview(await r.json())
    setBusy('')
  }
  async function sendTest() {
    setBusy('test'); setNotice(null)
    const phone = normalizePhone(tPhone)
    try {
      const r = await api('/api/whatsapp/test-template', { method: 'POST', body: JSON.stringify({ templateId: tTemplate, publisherId: tPublisher || undefined, targetPhone: phone }) })
      const d = await r.json()
      setNotice({ ok: r.ok && d.sendResult?.sent, text: d.sendResult?.sent ? 'Mensaje de prueba enviado.' : `No se envió: ${d.sendResult?.reason || d.error}` })
    } finally { setBusy('') }
  }

  const canSend = sendState?.canSend
  const pubName = (p: Publisher) => p.displayName || p.fullName

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Enviar mensaje</h1>
        <p className="text-sm text-graphite mt-1">Envíos puntuales (manual o de prueba). <strong>No crean automatizaciones ni batches.</strong></p>
      </div>

      {/* Estado de envío */}
      {sendState && (
        <div className={`rounded-xl px-4 py-3 text-sm ${canSend ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-800'}`}>
          {canSend ? '● WhatsApp listo — se puede enviar.' : `⚠ No se puede enviar: ${sendState.pauseReason} (estado: ${sendState.whatsappStatus}).`}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setTab('prueba')} className={`px-4 py-2 rounded-pill text-sm font-medium ${tab === 'prueba' ? 'bg-azure text-white' : 'bg-fog text-ink'}`}>Mensaje de prueba</button>
        <button onClick={() => setTab('manual')} className={`px-4 py-2 rounded-pill text-sm font-medium ${tab === 'manual' ? 'bg-azure text-white' : 'bg-fog text-ink'}`}>Mensaje manual</button>
      </div>

      {notice && <div className={`rounded-xl px-4 py-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{notice.text}</div>}

      {/* PRUEBA */}
      {tab === 'prueba' && (
        <div className="bg-white rounded-card p-6 space-y-4">
          <p className="text-xs text-graphite">Prueba una plantilla activa con datos de ejemplo o de un publicador real. Se envía a un teléfono autorizado y <strong>no dispara automatizaciones</strong>.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-graphite mb-1">Plantilla</label>
              <select value={tTemplate} onChange={(e) => { setTTemplate(e.target.value); setTPreview(null) }} className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm">
                {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-graphite mb-1">Publicador (opcional)</label>
              <select value={tPublisher} onChange={(e) => { setTPublisher(e.target.value); setTPreview(null) }} className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm">
                <option value="">(datos de ejemplo)</option>
                {publishers.map((p) => <option key={p.id} value={p.id}>{pubName(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-graphite mb-1">Teléfono de prueba</label>
              <div className="flex items-center gap-2">
                <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-16 px-2 py-2 bg-fog border border-silver-mist rounded-xl text-sm text-center" />
                <input value={tPhone} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setTPhone(v) }} placeholder="9611234567" maxLength={10} inputMode="numeric" className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm" />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={previewTest} disabled={!tTemplate || busy === 'preview'} className="text-sm font-medium text-azure px-4 py-2 rounded-pill border border-azure/40 hover:bg-azure/5 disabled:opacity-40">Previsualizar</button>
            <button onClick={sendTest} disabled={!tTemplate || !tPhone || !canSend || busy === 'test'} className="bg-azure text-white text-sm font-medium px-5 py-2 rounded-pill hover:opacity-90 disabled:opacity-40">Enviar prueba</button>
          </div>
          {tPreview && (
            <div className="space-y-2">
              <div className="text-xs text-graphite">Plantilla: <strong>{tPreview.templateType}</strong> · versión v{tPreview.version}</div>
              <div className="bg-[#e5ddd5] rounded-xl p-3"><div className="bg-[#dcf8c6] rounded-lg p-3 text-[13px] text-ink whitespace-pre-wrap shadow-sm">{renderWhatsapp(tPreview.rendered)}</div></div>
              <details className="text-xs text-graphite"><summary className="cursor-pointer">Variables usadas</summary><pre className="mt-1 bg-fog rounded-lg p-2 overflow-auto">{JSON.stringify(tPreview.variables, null, 2)}</pre></details>
            </div>
          )}
        </div>
      )}

      {/* MANUAL */}
      {tab === 'manual' && (
        <div className="bg-white rounded-card p-6 space-y-4">
          <p className="text-xs text-graphite">Mensaje de texto libre a un número. Respeta el formato WhatsApp. No queda en el historial de automatizaciones.</p>
          <div>
            <label className="block text-xs font-medium text-graphite mb-1">Teléfono</label>
            <div className="flex items-center gap-2">
              <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-16 px-2 py-2 bg-fog border border-silver-mist rounded-xl text-sm text-center" />
              <input value={mPhone} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setMPhone(v) }} placeholder="9611234567" maxLength={10} inputMode="numeric" className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-graphite mb-1">Mensaje (*negritas*, _cursivas_, saltos, emojis)</label>
            <textarea rows={6} value={mText} onChange={(e) => { setMText(e.target.value); setMConfirm(false) }} className="w-full px-3 py-2 border border-silver-mist rounded-xl text-sm font-mono resize-y" />
          </div>
          {mText.trim() && (
            <div className="bg-[#e5ddd5] rounded-xl p-3"><div className="bg-[#dcf8c6] rounded-lg p-3 text-[13px] text-ink whitespace-pre-wrap shadow-sm">{renderWhatsapp(mText)}</div></div>
          )}
          {!mConfirm ? (
            <button onClick={() => setMConfirm(true)} disabled={!mPhone || !mText.trim() || !canSend} className="bg-azure text-white text-sm font-medium px-5 py-2 rounded-pill hover:opacity-90 disabled:opacity-40">Revisar y enviar</button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-graphite">¿Enviar este mensaje a {mPhone}?</span>
              <button onClick={sendManual} disabled={busy === 'manual'} className="bg-emerald-600 text-white text-sm font-medium px-5 py-2 rounded-pill hover:opacity-90 disabled:opacity-40">Confirmar envío</button>
              <button onClick={() => setMConfirm(false)} className="text-sm text-graphite px-4 py-2 rounded-pill border border-silver-mist hover:bg-fog">Cancelar</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function renderWhatsapp(text: string): React.ReactNode {
  const parts = text.split(/(\*[^*]+\*|_[^_]+_)/g)
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>
    return <span key={i}>{p}</span>
  })
}
