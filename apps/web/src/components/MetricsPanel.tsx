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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map(({ icon: Icon, value, label }) => (
        <div key={label} className="bg-white rounded-card p-7">
          <Icon className="w-6 h-6 text-graphite mb-3" />
          <p className="text-3xl font-bold text-ink tracking-tight">{value}</p>
          <p className="text-sm text-graphite mt-1">{label}</p>
        </div>
      ))}

      {/* WhatsApp status card */}
      <div className="bg-white rounded-card p-7">
        <PhoneIcon className="w-6 h-6 text-graphite mb-3" />
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
          <p className="text-3xl font-bold text-ink tracking-tight">{statusLabel}</p>
        </div>
        <p className="text-sm text-graphite mt-1">WhatsApp</p>
      </div>
    </div>
  )
}
