import {
  PersonIcon,
  CalendarPlusIcon,
  ClipboardListIcon,
  BellAlertIcon,
  InboxIcon,
  PhoneIcon,
} from '@/components/icons/workflow-icons'

interface MetricsPanelProps {
  stats: {
    publicadores: number
    activeWeeks: number
    asignacionesPendientes: number
    pendingReminders: number
    messagesSentToday: number
  }
  whatsappStatus: 'connected' | 'waiting_qr' | 'disconnected'
}

const statusConfig = {
  connected: { dot: 'bg-emerald-500', label: 'Conectado' },
  waiting_qr: { dot: 'bg-amber-400', label: 'Esperando QR' },
  disconnected: { dot: 'bg-red-400', label: 'Desconectado' },
} as const

export default function MetricsPanel({ stats, whatsappStatus }: MetricsPanelProps) {
  const metrics = [
    { icon: PersonIcon, value: stats.publicadores, label: 'Publicadores activos' },
    { icon: CalendarPlusIcon, value: stats.activeWeeks, label: 'Semanas activas' },
    { icon: ClipboardListIcon, value: stats.asignacionesPendientes, label: 'Asignaciones pendientes' },
    { icon: BellAlertIcon, value: stats.pendingReminders, label: 'Recordatorios pendientes' },
    { icon: InboxIcon, value: stats.messagesSentToday, label: 'Mensajes hoy' },
  ]

  const { dot, label: statusLabel } = statusConfig[whatsappStatus]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {metrics.map(({ icon: Icon, value, label }) => (
        <div key={label} className="bg-white rounded-card p-5">
          <Icon className="w-5 h-5 text-graphite mb-2" />
          <p className="text-2xl font-bold text-ink tracking-tight">{value}</p>
          <p className="text-xs text-graphite mt-0.5 leading-tight">{label}</p>
        </div>
      ))}

      {/* WhatsApp status card */}
      <div className="bg-white rounded-card p-5">
        <PhoneIcon className="w-5 h-5 text-graphite mb-2" />
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <p className="text-sm font-semibold text-ink">{statusLabel}</p>
        </div>
        <p className="text-xs text-graphite mt-0.5">WhatsApp</p>
      </div>
    </div>
  )
}
