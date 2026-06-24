'use client'

import Link from 'next/link'
import {
  PersonIcon,
  CalendarPlusIcon,
  ClipboardListIcon,
  BellAlertIcon,
  PhoneIcon,
  InboxIcon,
} from '@/components/icons/workflow-icons'

const steps = [
  {
    number: 1,
    label: 'Registrar publicadores',
    description: 'Registra los publicadores que recibiran asignaciones',
    href: '/dashboard/publicadores',
    Icon: PersonIcon,
  },
  {
    number: 2,
    label: 'Crear semana de reunion',
    description: 'Crea la semana con fecha y hora de reunion',
    href: '/dashboard/semanas',
    Icon: CalendarPlusIcon,
  },
  {
    number: 3,
    label: 'Agregar asignaciones',
    description: 'Agrega asignaciones dentro de cada semana',
    href: '/dashboard/semanas',
    Icon: ClipboardListIcon,
  },
  {
    number: 4,
    label: 'Generar recordatorios',
    description: 'Genera los recordatorios automaticos',
    href: '/dashboard/semanas',
    Icon: BellAlertIcon,
  },
  {
    number: 5,
    label: 'Verificar WhatsApp',
    description: 'Verifica la conexion de WhatsApp',
    href: '/dashboard/whatsapp',
    Icon: PhoneIcon,
  },
  {
    number: 6,
    label: 'Revisar historial',
    description: 'Revisa los mensajes enviados y fallidos',
    href: '/dashboard/historial',
    Icon: InboxIcon,
  },
]

export default function WorkflowGuide() {
  return (
    <div className="bg-white rounded-card p-5 sm:p-7">
      <h2 className="text-base font-semibold text-ink tracking-tight mb-4">
        Flujo de trabajo
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((step) => (
          <Link
            key={step.number}
            href={step.href}
            aria-label={`Ir a ${step.label}`}
            className="flex items-start gap-3 p-3 rounded-xl hover:bg-fog transition-colors group"
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-fog flex items-center justify-center group-hover:bg-silver-mist transition-colors">
              <step.Icon className="w-4.5 h-4.5 text-graphite" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-medium text-azure leading-none">
                Paso {step.number}
              </span>
              <span className="text-sm font-medium text-ink block mt-0.5 leading-tight">
                {step.label}
              </span>
              <p className="text-xs text-graphite mt-0.5 leading-tight">
                {step.description}
              </p>
            </div>
            <svg
              className="w-4 h-4 text-graphite/40 flex-shrink-0 mt-1 group-hover:text-azure transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  )
}
