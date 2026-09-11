'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { StatusDot } from '@/components/StatusDot'
import { isLockedPath } from '@/lib/locked-features'

// ─── Types ───────────────────────────────────────────────
type Severity = 'critical' | 'warning' | 'info'
interface WeekItem { id: string; status: string; meetingDate: string; meetingDateLocal: string; meetingTime: string; programName: string | null; assignmentCount: number; pending: number; failed: number }
interface TodayAutomations { total: number; pending: number; queued: number; sending: number; sent: number; failed: number }
interface Alert { id: string; severity: Severity; title: string; detail: string; actionLabel: string; href: string }
interface OperationalCenter {
  todayLocal: string
  system: { worker: { status: string; label: string }; whatsapp: { status: string; label: string; ready: boolean; connectedNumber: string | null }; lastSyncAt: string }
  weeks: { thisWeek: WeekItem[] }
  automations: { today: TodayAutomations }
  alerts: Alert[]
}

// ─── Helpers ─────────────────────────────────────────────
const WEEKDAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MONTHS_LONG = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function parseLocalDate(v: string) { const [y,m,d] = v.split('T')[0].split('-').map(Number); return { y,m,d, dow: new Date(Date.UTC(y,m-1,d)).getUTCDay() } }
function todayHeadline(v: string) { const {d,m,y,dow} = parseLocalDate(v); return `${WEEKDAYS[dow]} ${d} de ${MONTHS_LONG[m-1]} de ${y}` }
function waDot(s: string): 'green'|'yellow'|'red' { return s==='READY'?'green':s==='QR_REQUIRED'?'yellow':'red' }
function workerDot(s: string): 'green'|'yellow'|'red' { return s==='running'?'green':s==='attention'?'yellow':'red' }
function severityDot(s: Severity): 'red'|'yellow'|'gray' { return s==='critical'?'red':s==='warning'?'yellow':'gray' }
function relativeSync(v: string) { if(!v) return 'Sin registro'; const m=Math.round((Date.now()-new Date(v).getTime())/60000); if(m<1) return 'hace un momento'; if(m<60) return `hace ${m} min`; const h=Math.round(m/60); if(h<24) return `hace ${h} h`; return new Date(v).toLocaleDateString('es-MX',{day:'2-digit',month:'short'}) }

// ─── Hero Illustration ───────────────────────────────────
function HeroIllustration() {
  return (
    <div className="relative w-52 h-52 lg:w-60 lg:h-60 flex-shrink-0 hidden sm:block">
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-azure/15 via-azure/8 to-transparent" />
      {/* Calendar */}
      <div className="absolute top-5 left-4 w-[5.5rem] h-[6.5rem] bg-white rounded-2xl shadow-[0_8px_24px_-4px_rgba(59,130,246,0.15)] border border-azure/10 transform -rotate-6">
        <div className="h-6 bg-gradient-to-r from-azure to-blue-500 rounded-t-2xl flex items-center px-2.5">
          <div className="flex gap-1"><div className="w-1.5 h-1.5 rounded-full bg-white/60"/><div className="w-1.5 h-1.5 rounded-full bg-white/40"/></div>
        </div>
        <div className="p-2.5 space-y-2">
          <div className="h-1.5 w-12 bg-azure/25 rounded-full" />
          <div className="h-1.5 w-9 bg-azure/15 rounded-full" />
          <div className="grid grid-cols-4 gap-1 mt-2">
            <div className="w-2.5 h-2.5 rounded bg-azure/30" /><div className="w-2.5 h-2.5 rounded bg-azure/15" />
            <div className="w-2.5 h-2.5 rounded bg-azure/20" /><div className="w-2.5 h-2.5 rounded bg-azure/10" />
          </div>
        </div>
      </div>
      {/* Message card */}
      <div className="absolute top-3 right-2 w-[5rem] h-[4.2rem] bg-white rounded-2xl shadow-[0_8px_24px_-4px_rgba(59,130,246,0.12)] border border-azure/10 transform rotate-6 p-3">
        <div className="h-1.5 w-11 bg-azure/25 rounded-full mb-2" />
        <div className="h-1.5 w-8 bg-azure/15 rounded-full mb-2" />
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-full bg-emerald-400/50 flex items-center justify-center"><div className="w-1.5 h-1.5 bg-emerald-500/80 rounded-full"/></div>
          <div className="h-1.5 w-7 bg-emerald-400/25 rounded-full" />
        </div>
      </div>
      {/* Checklist */}
      <div className="absolute bottom-4 right-3 w-[5.5rem] h-[5rem] bg-white rounded-2xl shadow-[0_8px_24px_-4px_rgba(59,130,246,0.12)] border border-azure/10 transform rotate-3 p-3">
        {[true, true, false].map((done, i) => (
          <div key={i} className="flex items-center gap-2 mb-2 last:mb-0">
            <div className={`w-3.5 h-3.5 rounded-md border-2 flex items-center justify-center ${done ? 'border-azure bg-azure/10' : 'border-gray-300'}`}>
              {done && <div className="w-1.5 h-1.5 bg-azure rounded-sm" />}
            </div>
            <div className={`h-1.5 rounded-full ${done ? 'w-10 bg-azure/20' : 'w-8 bg-gray-200'}`} />
          </div>
        ))}
      </div>
      {/* Bell accent */}
      <div className="absolute bottom-7 left-6 w-11 h-11 bg-gradient-to-br from-azure/15 to-azure/5 rounded-full flex items-center justify-center shadow-sm">
        <svg className="w-5 h-5 text-azure/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/>
        </svg>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────
export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [center, setCenter] = useState<OperationalCenter | null>(null)
  const [loadError, setLoadError] = useState('')

  const loadData = useCallback(async () => {
    try {
      const res = await api('/api/dashboard')
      if (!res.ok) throw new Error('No se pudo cargar el inicio')
      const data = await res.json()
      if (!data.operationalCenter) throw new Error('Respuesta incompleta del servidor')
      setCenter(data.operationalCenter)
      setLoadError('')
    } catch (err) { setLoadError(err instanceof Error ? err.message : 'Error de conexion') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData(); const i = setInterval(() => { if (document.visibilityState==='visible') loadData() }, 30000); return () => clearInterval(i) }, [loadData])

  const currentWeekHref = useMemo(() => { const f = center?.weeks?.thisWeek?.[0]; return f ? `/dashboard/semanas/${f.id}` : '/dashboard/semanas' }, [center])
  const alerts = center?.alerts ?? []
  const thisWeekList = center?.weeks?.thisWeek ?? []
  const criticalAlert = alerts.find((a) => a.severity === 'critical') || null
  const hasPublishersAlert = alerts.some((a) => a.id === 'no-publishers' || a.title?.toLowerCase().includes('publicador'))
  const nonCriticalAlerts = alerts.filter((a) => a.severity !== 'critical' && a.id !== 'no-publishers' && !a.title?.toLowerCase().includes('publicador'))

  if (loading) return (
    <div className="mx-auto w-full max-w-5xl space-y-6 animate-pulse">
      <div className="h-56 rounded-[1.75rem] bg-white" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><div className="h-32 rounded-2xl bg-white"/><div className="h-32 rounded-2xl bg-white"/><div className="h-32 rounded-2xl bg-white"/><div className="h-32 rounded-2xl bg-white"/></div>
      <div className="h-40 rounded-[1.75rem] bg-white" />
    </div>
  )

  if (!center) return (
    <div className="mx-auto w-full max-w-5xl rounded-[1.75rem] bg-white p-10 text-center shadow-sm border border-silver-mist/60">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-azure/10 flex items-center justify-center mb-5">
        <svg className="w-8 h-8 text-azure" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
      </div>
      <h1 className="text-xl font-bold text-ink">No se pudo cargar el centro de control</h1>
      <p className="mt-2 text-sm text-graphite max-w-sm mx-auto">{loadError || 'Revisa la conexion con el servidor e intenta de nuevo.'}</p>
      <button onClick={loadData} className="mt-6 bg-azure text-white text-sm font-medium px-6 py-3 rounded-xl hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  )

  const today = center.automations.today
  const todayPending = today.pending + today.queued + today.sending
  const todayAllZero = today.total === 0 && today.sent === 0 && today.failed === 0

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7">

      {/* ━━━ HERO ━━━ */}
      <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-white via-white to-azure/[0.04] border border-silver-mist/50 shadow-[0_2px_12px_-3px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col lg:flex-row items-center gap-6 p-7 sm:p-10">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-azure/80 uppercase tracking-widest mb-3">{todayHeadline(center.todayLocal)}</p>
            <h1 className="text-[1.75rem] sm:text-[2rem] font-bold text-ink tracking-tight leading-[1.2]">Centro de gestion de reuniones</h1>
            <p className="mt-3 text-[15px] text-graphite leading-relaxed max-w-md">
              Organiza publicadores, programas, asignaciones y recordatorios por WhatsApp.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard/publicadores" className="inline-flex items-center gap-2 bg-azure text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-sm shadow-azure/20 hover:shadow-md hover:shadow-azure/25 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                Registrar publicador
              </Link>
              <Link href="/dashboard/programas" className="inline-flex items-center gap-2 bg-white text-ink text-sm font-semibold px-5 py-3 rounded-xl border border-silver-mist shadow-sm hover:border-azure/30 hover:shadow-md transition-all">
                Crear programa
              </Link>
              <Link href="/dashboard/enviar" className="inline-flex items-center gap-2 text-azure text-sm font-semibold px-4 py-3 rounded-xl hover:bg-azure/5 transition-colors">
                Enviar mensaje
              </Link>
            </div>
          </div>
          <HeroIllustration />
        </div>
      </section>

      {/* ━━━ CRITICAL ALERT ━━━ */}
      {criticalAlert && (
        <Link href={criticalAlert.href} className="flex items-center gap-4 rounded-2xl bg-red-50 border border-red-100 px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
          <StatusDot color="red" pulse />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-red-800">{criticalAlert.title}</p>
            <p className="text-xs text-red-600 mt-0.5">{criticalAlert.detail}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-red-700 bg-red-100 px-3 py-1.5 rounded-lg">{criticalAlert.actionLabel}</span>
        </Link>
      )}

      {/* ━━━ ONBOARDING: No publishers ━━━ */}
      {hasPublishersAlert && (
        <section className="rounded-[1.75rem] bg-gradient-to-r from-azure/[0.04] to-blue-50/50 border border-azure/15 p-6 sm:p-7">
          <div className="flex items-start gap-5">
            <div className="w-12 h-12 rounded-2xl bg-azure/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-azure" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-ink">Primero registra publicadores</h3>
              <p className="text-sm text-graphite mt-1 leading-relaxed">Para generar programas, asignar participaciones y enviar recordatorios, agrega los publicadores de la congregacion.</p>
              <Link href="/dashboard/publicadores" className="mt-4 inline-flex items-center gap-2 bg-azure text-white text-xs font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>
                Ir a publicadores
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ━━━ SYSTEM STATUS ━━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>}
          title="WhatsApp"
          value={center.system.whatsapp.ready ? 'Conectado' : center.system.whatsapp.label}
          subtitle={center.system.whatsapp.ready ? 'Listo para enviar mensajes' : 'Requiere atencion'}
          dot={waDot(center.system.whatsapp.status)}
          href="/dashboard/whatsapp"
        />
        <StatusCard
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>}
          title="Automatizaciones"
          value={center.system.worker.status === 'running' ? 'Activo' : 'Detenido'}
          subtitle={center.system.worker.status === 'running' ? 'Recordatorios funcionando' : center.system.worker.label}
          dot={workerDot(center.system.worker.status)}
          href="/dashboard/automatizaciones"
        />
        <StatusCard
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>}
          title="Semanas"
          value={thisWeekList.length > 0 ? `${thisWeekList.length} activa${thisWeekList.length>1?'s':''}` : 'Sin actividad'}
          subtitle={thisWeekList.length > 0 ? 'Reuniones programadas' : 'Crea una para comenzar'}
          dot={thisWeekList.length > 0 ? 'green' : 'gray'}
          href="/dashboard/semanas"
        />
        <StatusCard
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          title="Worker"
          value={relativeSync(center.system.lastSyncAt)}
          subtitle="Ultima ejecucion"
          dot="gray"
        />
      </div>

      {/* ━━━ ALERTS (non-critical, non-publisher) ━━━ */}
      {nonCriticalAlerts.length > 0 && (
        <section className="rounded-[1.75rem] bg-white border border-silver-mist/50 shadow-[0_2px_12px_-3px_rgba(0,0,0,0.05)] p-6 sm:p-8">
          <h2 className="text-lg font-bold text-ink mb-4">Requiere atencion</h2>
          <div className="space-y-2.5">
            {nonCriticalAlerts.map((alert) => (
              <Link key={alert.id} href={alert.href} className="flex items-start gap-3 rounded-2xl border border-silver-mist/70 px-5 py-4 hover:border-azure/25 hover:shadow-sm transition-all">
                <span className="mt-0.5"><StatusDot color={severityDot(alert.severity)} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{alert.title}</p>
                  <p className="text-xs text-graphite mt-0.5">{alert.detail}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-azure mt-0.5">{alert.actionLabel}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ━━━ QUICK ACTIONS ━━━ */}
      <section className="rounded-[1.75rem] bg-white border border-silver-mist/50 shadow-[0_2px_12px_-3px_rgba(0,0,0,0.05)] p-6 sm:p-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-ink">Acciones rapidas</h2>
          <p className="text-xs text-graphite mt-0.5">Atajos a las funciones principales del sistema</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction href="/dashboard/publicadores" title="Registrar publicador" desc="Agrega datos y capacidades para futuras asignaciones." icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"/></svg>} />
          <QuickAction href="/dashboard/programas" title="Crear programa mensual" desc="Define el mes y prepara sus semanas de reunion." icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>} />
          <QuickAction href={currentWeekHref} title="Ver semanas" desc="Revisa asignaciones y genera recordatorios." icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"/></svg>} />
          <QuickAction href="/dashboard/enviar" title="Enviar mensaje" desc="Envia una prueba o mensaje manual por WhatsApp." icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>} />
          <QuickAction href="/dashboard/plantillas" title="Editar plantillas" desc="Actualiza los textos usados en recordatorios." icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>} />
          <QuickAction href="/dashboard/whatsapp" title="Revisar WhatsApp" desc="Verifica la conexion y el estado del servicio." icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>} />
        </div>
      </section>

      {/* ━━━ ALL-CLEAR (only when no alerts) ━━━ */}
      {alerts.length === 0 && (
        <div className="flex items-center gap-4 rounded-2xl bg-emerald-50/60 border border-emerald-100/80 px-6 py-4">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Todo en orden</p>
            <p className="text-xs text-emerald-700/80">No hay nada que requiera tu atencion en este momento.</p>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Subcomponents ───────────────────────────────────────
function StatusCard({ icon, title, value, subtitle, dot, href }: { icon: React.ReactNode; title: string; value: string; subtitle: string; dot: 'green'|'yellow'|'red'|'gray'; href?: string }) {
  const content = (
    <div className="rounded-2xl bg-white border border-silver-mist/50 shadow-[0_2px_12px_-3px_rgba(0,0,0,0.05)] p-5 hover:border-azure/25 hover:shadow-md transition-all h-full">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-azure/8 flex items-center justify-center text-azure">{icon}</div>
        <span className="text-[11px] font-semibold text-graphite uppercase tracking-wider">{title}</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <StatusDot color={dot} />
        <p className="text-[15px] font-bold text-ink leading-tight">{value}</p>
      </div>
      <p className="text-xs text-graphite leading-relaxed">{subtitle}</p>
    </div>
  )
  // Apartado bloqueado: la tarjeta se sigue mostrando, pero no enlaza.
  if (href && isLockedPath(href)) {
    return <div title="Apartado bloqueado" className="cursor-not-allowed opacity-60">{content}</div>
  }
  if (href) return <Link href={href}>{content}</Link>
  return content
}

function MetricTile({ label, value, color }: { label: string; value: number; color?: 'amber'|'green'|'red' }) {
  const colors = { amber: 'text-amber-600 bg-amber-50 border-amber-100', green: 'text-emerald-600 bg-emerald-50 border-emerald-100', red: 'text-red-600 bg-red-50 border-red-100' }
  const base = color ? colors[color] : 'text-ink bg-fog/50 border-silver-mist/40'
  return (
    <div className={`rounded-2xl border px-4 py-5 text-center ${base}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
    </div>
  )
}

function QuickAction({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  // Los accesos rapidos a apartados bloqueados no se muestran.
  if (isLockedPath(href)) return null
  return (
    <Link href={href} className="flex items-start gap-4 rounded-2xl border border-silver-mist/50 bg-white p-4 hover:border-azure/25 hover:shadow-sm transition-all group">
      <div className="w-10 h-10 rounded-xl bg-azure/8 flex items-center justify-center text-azure flex-shrink-0 group-hover:bg-azure/12 transition-colors">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink group-hover:text-azure transition-colors">{title}</p>
        <p className="text-xs text-graphite mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </Link>
  )
}
