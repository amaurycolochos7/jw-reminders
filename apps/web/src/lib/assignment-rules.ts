/**
 * Reglas de asignación (espejo de packages/shared/src/assignment-rules).
 *
 * El build de producción de la web (apps/web/Dockerfile) NO compila el paquete
 * @jw-reminders/shared, por eso estas reglas se mantienen aquí en local.
 * Si cambian las reglas, actualizar AMBOS archivos.
 */

export type GenderValue = 'MALE' | 'FEMALE'
export type SectionId =
  | 'BIBLE_READING'
  | 'APPLY_YOURSELF'
  | 'OPENING'
  | 'TREASURES'
  | 'LIVING_AS_CHRISTIANS'
  | 'CONCLUSION'
export type AssignmentTypeId =
  | 'BIBLE_READING'
  | 'START_CONVERSATION'
  | 'MAKE_RETURN_VISIT'
  | 'BIBLE_STUDY'
  | 'EXPLAIN_BELIEFS'
  | 'MAKE_DISCIPLES'
  | 'TALK'
  | 'AUDIENCE_ANALYSIS'
  | 'OTHER'
  // Fase 3: resto de la reunión.
  | 'CHAIRMAN'
  | 'OPENING_COMMENTS'
  | 'OPENING_PRAYER'
  | 'TREASURES_TALK'
  | 'SPIRITUAL_GEMS'
  | 'CHRISTIAN_LIVING'
  | 'CONGREGATION_BIBLE_STUDY_CONDUCTOR'
  | 'CONGREGATION_BIBLE_STUDY_READER'
  | 'CONCLUDING_COMMENTS'
  | 'CLOSING_PRAYER'
  | 'SONG'

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
  AUDIENCE_ANALYSIS: { type: 'AUDIENCE_ANALYSIS', label: 'Análisis con el auditorio', section: 'APPLY_YOURSELF', defaultTitle: 'Análisis con el auditorio', defaultDurationMinutes: 6, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  OTHER: { type: 'OTHER', label: 'Otra asignación', section: 'APPLY_YOURSELF', defaultTitle: 'Otra asignación', defaultDurationMinutes: 5, needsCompanion: false, allowedAssigneeGenders: [], companionSameGender: false },
  // ─── Fase 3: resto de la reunión. Todas sin acompañante y solo hombres. ───
  CHAIRMAN: { type: 'CHAIRMAN', label: 'Presidente', section: 'OPENING', defaultTitle: 'Presidente de la reunión', defaultDurationMinutes: 0, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  OPENING_COMMENTS: { type: 'OPENING_COMMENTS', label: 'Palabras de introducción', section: 'OPENING', defaultTitle: 'Palabras de introducción', defaultDurationMinutes: 1, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  OPENING_PRAYER: { type: 'OPENING_PRAYER', label: 'Oración inicial', section: 'OPENING', defaultTitle: 'Oración inicial', defaultDurationMinutes: 0, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  TREASURES_TALK: { type: 'TREASURES_TALK', label: 'Tesoros de la Biblia', section: 'TREASURES', defaultTitle: 'Tesoros de la Biblia', defaultDurationMinutes: 10, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  SPIRITUAL_GEMS: { type: 'SPIRITUAL_GEMS', label: 'Busquemos perlas escondidas', section: 'TREASURES', defaultTitle: 'Busquemos perlas escondidas', defaultDurationMinutes: 10, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  CHRISTIAN_LIVING: { type: 'CHRISTIAN_LIVING', label: 'Nuestra Vida Cristiana', section: 'LIVING_AS_CHRISTIANS', defaultTitle: 'Nuestra Vida Cristiana', defaultDurationMinutes: 15, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  CONGREGATION_BIBLE_STUDY_CONDUCTOR: { type: 'CONGREGATION_BIBLE_STUDY_CONDUCTOR', label: 'Estudio Bíblico de la Congregación (conductor)', section: 'LIVING_AS_CHRISTIANS', defaultTitle: 'Estudio bíblico de la congregación', defaultDurationMinutes: 30, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  CONGREGATION_BIBLE_STUDY_READER: { type: 'CONGREGATION_BIBLE_STUDY_READER', label: 'Estudio Bíblico de la Congregación (lector)', section: 'LIVING_AS_CHRISTIANS', defaultTitle: 'Lector del estudio bíblico de la congregación', defaultDurationMinutes: 0, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  CONCLUDING_COMMENTS: { type: 'CONCLUDING_COMMENTS', label: 'Palabras de conclusión', section: 'CONCLUSION', defaultTitle: 'Palabras de conclusión', defaultDurationMinutes: 3, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  CLOSING_PRAYER: { type: 'CLOSING_PRAYER', label: 'Oración final', section: 'CONCLUSION', defaultTitle: 'Oración final', defaultDurationMinutes: 0, needsCompanion: false, allowedAssigneeGenders: ['MALE'], companionSameGender: false },
  SONG: { type: 'SONG', label: 'Canción', section: 'OPENING', defaultTitle: 'Canción', defaultDurationMinutes: 0, needsCompanion: false, allowedAssigneeGenders: [], companionSameGender: false },
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

export type RequiredCapability =
  | 'canBibleReading'
  | 'canGiveTalk'
  | 'canParticipateSMM'
  | 'canBeChairman'
  | 'canTreasures'
  | 'canSpiritualGems'
  | 'canChristianLife'
  | 'canConductCBS'
  | 'canReadCBS'

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
  // Capacidades de partes de reunión (Fase 3).
  canBeChairman?: boolean
  canTreasures?: boolean
  canSpiritualGems?: boolean
  canChristianLife?: boolean
  canConductCBS?: boolean
  canReadCBS?: boolean
}

/** Capacidad requerida por tipo de asignación. null = sin capacidad específica. */
export const ASSIGNMENT_TYPE_REQUIRED_CAPABILITY: Record<
  AssignmentTypeId,
  RequiredCapability | null
> = {
  BIBLE_READING: 'canBibleReading',
  START_CONVERSATION: 'canParticipateSMM',
  MAKE_RETURN_VISIT: 'canParticipateSMM',
  BIBLE_STUDY: 'canParticipateSMM',
  EXPLAIN_BELIEFS: 'canParticipateSMM',
  MAKE_DISCIPLES: 'canParticipateSMM',
  TALK: 'canGiveTalk',
  AUDIENCE_ANALYSIS: 'canGiveTalk',
  OTHER: null,
  CHAIRMAN: 'canBeChairman',
  OPENING_COMMENTS: 'canBeChairman',
  OPENING_PRAYER: 'canBeChairman',
  TREASURES_TALK: 'canTreasures',
  SPIRITUAL_GEMS: 'canSpiritualGems',
  CHRISTIAN_LIVING: 'canChristianLife',
  CONGREGATION_BIBLE_STUDY_CONDUCTOR: 'canConductCBS',
  CONGREGATION_BIBLE_STUDY_READER: 'canReadCBS',
  CONCLUDING_COMMENTS: 'canBeChairman',
  CLOSING_PRAYER: 'canBeChairman',
  SONG: null,
}

export function requiredCapabilityForType(type: string): RequiredCapability | null {
  return ASSIGNMENT_TYPE_REQUIRED_CAPABILITY[type as AssignmentTypeId] ?? null
}

/** ¿Es una parte informativa (no asignable), como una canción? */
export function isInformationalType(type: string): boolean {
  return type === 'SONG'
}

/**
 * Tipos de parte que NO llevan duración (espejo de packages/shared): el
 * presidente es un rol y las oraciones no se cronometran. La UI oculta el campo
 * de duración y no muestra "0 min". "Palabras de introducción" (OPENING_COMMENTS)
 * SÍ tiene duración (1 min informativa) y no está aquí.
 */
export const NO_DURATION_TYPES: AssignmentTypeId[] = ['CHAIRMAN', 'OPENING_PRAYER', 'CLOSING_PRAYER']

export function typeHasNoDuration(type: string): boolean {
  return NO_DURATION_TYPES.includes(type as AssignmentTypeId)
}

/**
 * Partes que por defecto realiza el presidente y se autocompletan con él: oración
 * inicial, palabras de introducción y palabras de conclusión. Al cambiar el
 * presidente, estas tres lo siguen (salvo las editadas a mano). La oración final
 * NO está aquí: la hace otra persona (se elige entre los demás que pueden orar).
 */
export const CHAIRMAN_AUTOFILL_TYPES: AssignmentTypeId[] = [
  'OPENING_PRAYER',
  'OPENING_COMMENTS',
  'CONCLUDING_COMMENTS',
]

export function isChairmanAutofillType(type: string): boolean {
  return CHAIRMAN_AUTOFILL_TYPES.includes(type as AssignmentTypeId)
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

/**
 * Tipos ordenados para mostrar en el selector "Parte". Excluye SONG (informativa,
 * no asignable). El orden refleja el flujo de la reunión.
 */
export const ASSIGNMENT_TYPE_OPTIONS: { value: AssignmentTypeId; label: string }[] = [
  { value: 'CHAIRMAN', label: 'Presidente' },
  { value: 'OPENING_COMMENTS', label: 'Palabras de introducción' },
  { value: 'OPENING_PRAYER', label: 'Oración inicial' },
  { value: 'TREASURES_TALK', label: 'Tesoros de la Biblia' },
  { value: 'SPIRITUAL_GEMS', label: 'Busquemos perlas escondidas' },
  { value: 'BIBLE_READING', label: 'Lectura de la Biblia' },
  { value: 'START_CONVERSATION', label: 'Empiece conversaciones' },
  { value: 'MAKE_RETURN_VISIT', label: 'Haga revisitas' },
  { value: 'BIBLE_STUDY', label: 'Curso bíblico' },
  { value: 'EXPLAIN_BELIEFS', label: 'Explique sus creencias' },
  { value: 'MAKE_DISCIPLES', label: 'Haga discípulos' },
  { value: 'TALK', label: 'Discurso' },
  { value: 'AUDIENCE_ANALYSIS', label: 'Análisis con el auditorio' },
  { value: 'CHRISTIAN_LIVING', label: 'Nuestra Vida Cristiana' },
  { value: 'CONGREGATION_BIBLE_STUDY_CONDUCTOR', label: 'Estudio Bíblico de la Congregación (conductor)' },
  { value: 'CONGREGATION_BIBLE_STUDY_READER', label: 'Estudio Bíblico de la Congregación (lector)' },
  { value: 'CONCLUDING_COMMENTS', label: 'Palabras de conclusión' },
  { value: 'CLOSING_PRAYER', label: 'Oración final' },
  { value: 'OTHER', label: 'Otra asignación' },
]
