/**
 * Helpers puros (sin React) para el estado de importación del programa de WOL.
 * Fáciles de probar. Reflejan el enum WeekImportStatus del backend.
 */

export type WeekImportStatus = 'EMPTY' | 'IMPORTING' | 'READY' | 'NEEDS_REVIEW' | 'IMPORT_FAILED'

export interface ImportStatusMeta {
  /** Etiqueta corta para chips/badges. */
  label: string
  /** Mensaje descriptivo para paneles. */
  message: string
  /** Clases Tailwind para el chip. */
  className: string
  /** Color de punto de estado. */
  dot: 'green' | 'yellow' | 'red' | 'gray'
}

export const IMPORT_STATUS_META: Record<WeekImportStatus, ImportStatusMeta> = {
  EMPTY: {
    label: 'Sin programa',
    message: 'Esta semana todavía no tiene programa importado.',
    className: 'bg-fog text-graphite',
    dot: 'gray',
  },
  IMPORTING: {
    label: 'Importando',
    message: 'Importando programa desde WOL...',
    className: 'bg-amber-50 text-amber-700',
    dot: 'yellow',
  },
  READY: {
    label: 'Programa listo',
    message: 'Programa listo.',
    className: 'bg-emerald-50 text-emerald-700',
    dot: 'green',
  },
  NEEDS_REVIEW: {
    label: 'Requiere revisión',
    message: 'El programa requiere revisión.',
    className: 'bg-amber-50 text-amber-700',
    dot: 'yellow',
  },
  IMPORT_FAILED: {
    label: 'Error al importar',
    message: 'No se pudo importar el programa.',
    className: 'bg-red-50 text-red-700',
    dot: 'red',
  },
}

export function importStatusMeta(status: string | null | undefined): ImportStatusMeta {
  return IMPORT_STATUS_META[(status as WeekImportStatus)] ?? IMPORT_STATUS_META.EMPTY
}

/** Sólo se pueden generar participantes si el programa está importado (READY). */
export function canGenerateParticipants(status: string | null | undefined): boolean {
  return status === 'READY'
}

/** Mensaje de bloqueo mostrado cuando la semana no está lista. */
export const PARTICIPANTS_BLOCKED_MESSAGE =
  'No se pueden generar participantes porque esta semana todavía no tiene programa importado.'

const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  return { y, m, d }
}

function addDaysISO(iso: string, days: number): string {
  const { y, m, d } = parseISODate(iso)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString()
}

/**
 * "29 de junio a 5 de julio" a partir del inicio de semana (lunes) ISO.
 * Si no se pasa fin, usa inicio + 6 días (domingo).
 */
export function formatWeekRange(weekStartISO: string, weekEndISO?: string): string {
  const start = parseISODate(weekStartISO)
  const end = parseISODate(weekEndISO ?? addDaysISO(weekStartISO, 6))
  return `${start.d} de ${MONTHS_LONG[start.m - 1]} a ${end.d} de ${MONTHS_LONG[end.m - 1]}`
}
