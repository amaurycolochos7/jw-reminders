/**
 * Capacidades y estado congregacional del publicador
 * (espejo de packages/shared/src/publisher-capabilities).
 *
 * El build de producción de la web (apps/web/Dockerfile) NO compila el paquete
 * @jw-reminders/shared, por eso esta lógica se mantiene aquí en local.
 * Si cambian las reglas, actualizar AMBOS archivos.
 */

export type GenderValue = 'MALE' | 'FEMALE'
export type AppointmentValue = 'NONE' | 'ELDER' | 'MINISTERIAL_SERVANT'

export type CapabilityKey =
  | 'canReceiveAssignments'
  | 'canBeCompanion'
  | 'canParticipateSMM'
  | 'canBibleReading'
  | 'canGiveTalk'
  | 'canBeChairman'
  | 'canPray'
  | 'canTreasures'
  | 'canSpiritualGems'
  | 'canChristianLife'
  | 'canConductCBS'
  | 'canReadCBS'
  | 'canConcludingRemarks'

export interface CapabilityMeta {
  key: CapabilityKey
  label: string
  group: 'basic' | 'meeting'
  maleOnly: boolean
}

export const CAPABILITIES: CapabilityMeta[] = [
  { key: 'canReceiveAssignments', label: 'Recibir asignaciones', group: 'basic', maleOnly: false },
  { key: 'canBeCompanion', label: 'Ser acompañante', group: 'basic', maleOnly: false },
  { key: 'canParticipateSMM', label: 'Participar en Seamos Mejores Maestros', group: 'basic', maleOnly: false },
  { key: 'canBibleReading', label: 'Hacer Lectura de la Biblia', group: 'basic', maleOnly: true },
  { key: 'canGiveTalk', label: 'Hacer discurso', group: 'basic', maleOnly: true },
  { key: 'canBeChairman', label: 'Ser presidente', group: 'meeting', maleOnly: true },
  { key: 'canPray', label: 'Hacer oración', group: 'meeting', maleOnly: true },
  { key: 'canTreasures', label: 'Hacer Tesoros de la Biblia', group: 'meeting', maleOnly: true },
  { key: 'canSpiritualGems', label: 'Hacer Perlas Escondidas', group: 'meeting', maleOnly: false },
  { key: 'canChristianLife', label: 'Hacer Nuestra Vida Cristiana', group: 'meeting', maleOnly: true },
  { key: 'canConductCBS', label: 'Conducir Estudio Bíblico de la Congregación', group: 'meeting', maleOnly: true },
  { key: 'canReadCBS', label: 'Ser lector del Estudio Bíblico de la Congregación', group: 'meeting', maleOnly: true },
  { key: 'canConcludingRemarks', label: 'Hacer palabras de conclusión', group: 'meeting', maleOnly: false },
]

export const MALE_ONLY_CAPABILITIES: CapabilityKey[] = CAPABILITIES.filter((c) => c.maleOnly).map((c) => c.key)

export type PublisherCapabilities = Partial<Record<CapabilityKey, boolean>>

export interface PublisherCapabilityInput extends PublisherCapabilities {
  gender?: GenderValue | null
  isBaptized?: boolean
  isRegularPioneer?: boolean
  appointment?: AppointmentValue
}

const CAPABILITY_LABEL: Record<CapabilityKey, string> = CAPABILITIES.reduce(
  (acc, c) => {
    acc[c.key] = c.label
    return acc
  },
  {} as Record<CapabilityKey, string>,
)

export function validatePublisherCapabilities(input: PublisherCapabilityInput): string[] {
  const errors: string[] = []
  const gender = input.gender ?? null
  const appointment = input.appointment ?? 'NONE'

  if (appointment !== 'NONE' && gender !== 'MALE') {
    errors.push('Solo los hombres pueden ser nombrados (anciano o siervo ministerial).')
  }

  if (gender === 'FEMALE') {
    for (const key of MALE_ONLY_CAPABILITIES) {
      if (input[key] === true) {
        errors.push(`Una mujer no puede: ${CAPABILITY_LABEL[key].toLowerCase()}.`)
      }
    }
  }

  return errors
}

export function isValidPublisherCapabilities(input: PublisherCapabilityInput): boolean {
  return validatePublisherCapabilities(input).length === 0
}

export function enforceStrictCapabilities<T extends PublisherCapabilityInput>(input: T): T {
  const out = { ...input }
  if (out.gender === 'FEMALE') {
    for (const key of MALE_ONLY_CAPABILITIES) {
      if (out[key]) out[key] = false
    }
    out.appointment = 'NONE'
  }
  return out
}

export function suggestCapabilities(input: {
  gender?: GenderValue | null
  isBaptized?: boolean
  appointment?: AppointmentValue
}): Record<CapabilityKey, boolean> {
  const gender = input.gender ?? null
  const isBaptized = input.isBaptized ?? false
  const appointment = input.appointment ?? 'NONE'

  const caps: Record<CapabilityKey, boolean> = {
    canReceiveAssignments: false,
    canBeCompanion: false,
    canParticipateSMM: false,
    canBibleReading: false,
    canGiveTalk: false,
    canBeChairman: false,
    canPray: false,
    canTreasures: false,
    canSpiritualGems: false,
    canChristianLife: false,
    canConductCBS: false,
    canReadCBS: false,
    canConcludingRemarks: false,
  }

  caps.canReceiveAssignments = true
  caps.canBeCompanion = true
  caps.canParticipateSMM = true

  if (gender === 'FEMALE') {
    return caps
  }

  const isMaleLike = gender === 'MALE' || gender === null
  if (!isMaleLike) {
    return caps
  }

  caps.canBibleReading = true

  if (isBaptized) {
    caps.canGiveTalk = true
  }

  if (appointment === 'ELDER' || appointment === 'MINISTERIAL_SERVANT') {
    caps.canGiveTalk = true
    caps.canBeChairman = true
    caps.canPray = true
    caps.canTreasures = true
    caps.canSpiritualGems = true
    caps.canChristianLife = true
    caps.canConductCBS = true
    caps.canReadCBS = true
    caps.canConcludingRemarks = true
  }

  return caps
}

export const APPOINTMENT_OPTIONS: { value: AppointmentValue; label: string }[] = [
  { value: 'NONE', label: 'Ninguno' },
  { value: 'ELDER', label: 'Anciano' },
  { value: 'MINISTERIAL_SERVANT', label: 'Siervo ministerial' },
]
