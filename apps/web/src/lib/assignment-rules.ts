/**
 * Reglas de asignación (espejo de packages/shared/src/assignment-rules).
 *
 * El build de producción de la web (apps/web/Dockerfile) NO compila el paquete
 * @jw-reminders/shared, por eso estas reglas se mantienen aquí en local.
 * Si cambian las reglas, actualizar AMBOS archivos.
 */

export type GenderValue = 'MALE' | 'FEMALE'
export type SectionId = 'BIBLE_READING' | 'APPLY_YOURSELF'
export type AssignmentTypeId =
  | 'BIBLE_READING'
  | 'START_CONVERSATION'
  | 'MAKE_RETURN_VISIT'
  | 'BIBLE_STUDY'
  | 'EXPLAIN_BELIEFS'
  | 'MAKE_DISCIPLES'
  | 'TALK'
  | 'OTHER'

export interface AssignmentTypeRule {
  type: AssignmentTypeId
  label: string
  section: SectionId
  defaultTitle: string
  defaultDurationMinutes: number
  needsCompanion: boolean
  allowedAssigneeGenders: GenderValue[]
  companionSameGender: boolean
}

export const ASSIGNMENT_TYPE_RULES: Record<AssignmentTypeId, AssignmentTypeRule> = {
  BIBLE_READING: { type: 'BIBLE_READING', label: 'Lectura de la Biblia', section: 'BIBLE_READING', defaultTitle: 'Lectura de la Biblia', defaultDurationMinutes: 4, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  START_CONVERSATION: { type: 'START_CONVERSATION', label: 'Empiece conversaciones', section: 'APPLY_YOURSELF', defaultTitle: 'Empiece conversaciones', defaultDurationMinutes: 3, needsCompanion: true, allowedAssigneeGenders: [], companionSameGender: true },
  MAKE_RETURN_VISIT: { type: 'MAKE_RETURN_VISIT', label: 'Haga revisitas', section: 'APPLY_YOURSELF', defaultTitle: 'Haga revisitas', defaultDurationMinutes: 4, needsCompanion: true, allowedAssigneeGenders: [], companionSameGender: true },
  BIBLE_STUDY: { type: 'BIBLE_STUDY', label: 'Curso bíblico', section: 'APPLY_YOURSELF', defaultTitle: 'Curso bíblico', defaultDurationMinutes: 5, needsCompanion: true, allowedAssigneeGenders: [], companionSameGender: true },
  EXPLAIN_BELIEFS: { type: 'EXPLAIN_BELIEFS', label: 'Explique sus creencias', section: 'APPLY_YOURSELF', defaultTitle: 'Explique sus creencias', defaultDurationMinutes: 5, needsCompanion: true, allowedAssigneeGenders: [], companionSameGender: true },
  MAKE_DISCIPLES: { type: 'MAKE_DISCIPLES', label: 'Haga discípulos', section: 'APPLY_YOURSELF', defaultTitle: 'Haga discípulos', defaultDurationMinutes: 5, needsCompanion: true, allowedAssigneeGenders: [], companionSameGender: true },
  TALK: { type: 'TALK', label: 'Discurso', section: 'APPLY_YOURSELF', defaultTitle: 'Discurso', defaultDurationMinutes: 5, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  OTHER: { type: 'OTHER', label: 'Otra asignación', section: 'APPLY_YOURSELF', defaultTitle: 'Otra asignación', defaultDurationMinutes: 5, needsCompanion: false, allowedAssigneeGenders: [], companionSameGender: false },
}

export function getAssignmentTypeRule(type: string): AssignmentTypeRule {
  return ASSIGNMENT_TYPE_RULES[type as AssignmentTypeId] ?? ASSIGNMENT_TYPE_RULES.OTHER
}

export function deriveSection(type: string): SectionId {
  return getAssignmentTypeRule(type).section
}
export function deriveTitle(type: string): string {
  return getAssignmentTypeRule(type).defaultTitle
}
export function deriveDurationMinutes(type: string): number {
  return getAssignmentTypeRule(type).defaultDurationMinutes
}
export function typeNeedsCompanion(type: string): boolean {
  return getAssignmentTypeRule(type).needsCompanion
}

export function isAssigneeGenderAllowed(type: string, gender: GenderValue | null | undefined): boolean {
  const rule = getAssignmentTypeRule(type)
  if (rule.allowedAssigneeGenders.length === 0) return true
  if (!gender) return true
  return rule.allowedAssigneeGenders.includes(gender)
}

export function isCompanionGenderAllowed(
  type: string,
  assigneeGender: GenderValue | null | undefined,
  companionGender: GenderValue | null | undefined,
): boolean {
  const rule = getAssignmentTypeRule(type)
  if (!rule.companionSameGender) return true
  if (!assigneeGender || !companionGender) return true
  return assigneeGender === companionGender
}

export type AssignmentRole = 'ASSIGNEE' | 'COMPANION'

export interface EligibilityPublisher {
  isActive?: boolean
  deletedAt?: Date | string | null
  canReceiveAssignments?: boolean
  canBeCompanion?: boolean
  gender?: GenderValue | null
  // Capacidades usadas por el generador (Fase 2). undefined = comportamiento legacy.
  canBibleReading?: boolean
  canGiveTalk?: boolean
  canParticipateSMM?: boolean
}

/** Capacidad requerida por tipo de asignación (Fase 2). null = sin capacidad específica. */
export const ASSIGNMENT_TYPE_REQUIRED_CAPABILITY: Record<
  AssignmentTypeId,
  'canBibleReading' | 'canGiveTalk' | 'canParticipateSMM' | null
> = {
  BIBLE_READING: 'canBibleReading',
  START_CONVERSATION: 'canParticipateSMM',
  MAKE_RETURN_VISIT: 'canParticipateSMM',
  BIBLE_STUDY: 'canParticipateSMM',
  EXPLAIN_BELIEFS: 'canParticipateSMM',
  MAKE_DISCIPLES: 'canParticipateSMM',
  TALK: 'canGiveTalk',
  OTHER: null,
}

export function requiredCapabilityForType(
  type: string,
): 'canBibleReading' | 'canGiveTalk' | 'canParticipateSMM' | null {
  return ASSIGNMENT_TYPE_REQUIRED_CAPABILITY[type as AssignmentTypeId] ?? null
}

/** Espejo de packages/shared: única fuente de verdad de elegibilidad. */
export function isPublisherEligibleForAssignment(
  publisher: EligibilityPublisher,
  assignmentType: string,
  role: AssignmentRole = 'ASSIGNEE',
): boolean {
  if (publisher.isActive === false) return false
  if (publisher.deletedAt) return false
  if (publisher.canReceiveAssignments === false) return false
  if (role === 'COMPANION' && publisher.canBeCompanion === false) return false

  const capField = requiredCapabilityForType(assignmentType)
  if (capField && publisher[capField] === false) return false

  if (role === 'ASSIGNEE' && !isAssigneeGenderAllowed(assignmentType, publisher.gender)) return false
  return true
}

/** Tipos ordenados para mostrar en el selector "Parte". */
export const ASSIGNMENT_TYPE_OPTIONS: { value: AssignmentTypeId; label: string }[] = [
  { value: 'BIBLE_READING', label: 'Lectura de la Biblia' },
  { value: 'START_CONVERSATION', label: 'Empiece conversaciones' },
  { value: 'MAKE_RETURN_VISIT', label: 'Haga revisitas' },
  { value: 'BIBLE_STUDY', label: 'Curso bíblico (haga discípulos)' },
  { value: 'EXPLAIN_BELIEFS', label: 'Explique sus creencias' },
  { value: 'MAKE_DISCIPLES', label: 'Haga discípulos' },
  { value: 'TALK', label: 'Discurso' },
  { value: 'OTHER', label: 'Otra asignación' },
]
