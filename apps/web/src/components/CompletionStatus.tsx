import { CheckCircleIcon, CircleOutlineIcon } from '@/components/icons/workflow-icons'

interface CompletionStatusProps {
  hasAssignments: boolean
  hasReminders: boolean
  whatsappConnected: boolean
}

export default function CompletionStatus({ hasAssignments, hasReminders, whatsappConnected }: CompletionStatusProps) {
  const stages = [
    { label: 'Semana creada', complete: true },
    { label: 'Asignaciones', complete: hasAssignments },
    { label: 'Recordatorios', complete: hasReminders },
    { label: 'WhatsApp', complete: whatsappConnected },
  ]

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {stages.map(stage => (
        <div key={stage.label} className="flex items-center gap-1">
          {stage.complete ? (
            <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
          ) : (
            <CircleOutlineIcon className="w-4 h-4 text-silver-mist" />
          )}
          <span className={`text-xs ${stage.complete ? 'text-ink' : 'text-graphite'}`}>{stage.label}</span>
        </div>
      ))}
    </div>
  )
}
