'use client'

import Link from 'next/link'
import {
  PersonIcon,
  CalendarPlusIcon,
  LayersIcon,
  ClipboardListIcon,
  BellAlertIcon,
  PhoneIcon,
  SquaresIcon,
} from '@/components/icons/workflow-icons'

const steps = [
  {
    number: 1,
    label: 'Registrar publicadores',
    description: 'Da de alta a quienes recibiran asignaciones',
    href: '/dashboard/publicadores',
    Icon: PersonIcon,
  },
  {
    number: 2,
    label: 'Crear programa mensual',
    description: 'Punto de partida: el programa del mes agrupa las semanas',
    href: '/dashboard/programas',
    Icon: CalendarPlusIcon,
  },
  {
    number: 3,
    label: 'Generar semanas',
    description: 'Crea las semanas del mes desde el programa',
    href: '/dashboard/programas',
    Icon: LayersIcon,
  },
  {
    number: 4,
    label: 'Crear o revisar asignaciones',
    description: 'Define participantes y acompanantes de cada semana',
    href: '/dashboard/semanas',
    Icon: ClipboardListIcon,
  },
  {
    number: 5,
    label: 'Generar automatizaciones',
    description: 'Programa los recordatorios de cada asignacion',
    href: '/dashboard/semanas',
    Icon: BellAlertIcon,
  },
  {
    number: 6,
    label: 'Verificar WhatsApp',
    description: 'Confirma que la sesion este conectada y lista',
    href: '/dashboard/whatsapp',
    Icon: PhoneIcon,
  },
  {
    number: 7,
    label: 'Supervisar Centro de Automatizaciones',
    description: 'Revisa que sale hoy, manana, pendientes y fallidos',
    href: '/dashboard/automatizaciones',
    Icon: SquaresIcon,
  },
]

export default function WorkflowGuide() {
  return (
    <div className="bg-white rounded-card p-5 sm:p-7">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink tracking-tight">
          Flujo de trabajo
        </h2>
        <p className="text-sm text-graphite mt-1">
          El camino recomendado de principio a fin. Sigue los pasos en orden.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((step) => (
          <Link
            key={step.number}
            href={step.href}
            aria-label={`Ir al paso ${step.number}: ${step.label}`}
            className="flex items-start gap-3 p-3 rounded-xl hover:bg-fog transition-colors group"
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-fog flex items-center justify-center group-hover:bg-silver-mist transition-colors">
              <step.Icon className="w-[18px] h-[18px] text-graphite" />
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
