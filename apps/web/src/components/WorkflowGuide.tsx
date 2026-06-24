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
    <div className="bg-white rounded-card p-7">
      <h2 className="text-lg font-semibold text-ink tracking-tight mb-6">
        Flujo de trabajo
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((step) => (
          <div key={step.number} className="flex flex-col">
            <step.Icon className="w-6 h-6 text-graphite mb-2" />
            <span className="text-xs font-medium text-azure">
              Paso {step.number}
            </span>
            <span className="text-sm font-medium text-ink">{step.label}</span>
            <p className="text-xs text-graphite mt-1">{step.description}</p>
            <Link
              href={step.href}
              aria-label={`Ir a ${step.label}`}
              className="text-azure text-xs font-medium mt-2 inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
            >
              Ir
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
