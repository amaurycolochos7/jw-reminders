/**
 * Reglas de asignación de Vida y Ministerio (fuente de verdad del backend).
 *
 * Centraliza, sin nuevas abstracciones, el conocimiento de:
 *  - qué información se deriva de cada tipo de asignación (sección, título, duración),
 *  - si una parte necesita acompañante,
 *  - qué género puede recibir cada tipo de asignación,
 *  - si el acompañante debe ser del mismo género que el asignado.
 *
 * El frontend (apps/web) mantiene un espejo de estas reglas en
 * `apps/web/src/lib/assignment-rules.ts` porque su build de producción no
 * compila este paquete. Mantener ambos sincronizados.
 */

export type GenderValue = "MALE" | "FEMALE";
export type SectionId =
  | "BIBLE_READING"
  | "APPLY_YOURSELF"
  // Fase 3: resto de la reunión.
  | "OPENING"
  | "TREASURES"
  | "LIVING_AS_CHRISTIANS"
  | "CONCLUSION";
export type RoomId = "MAIN" | "AUXILIARY";
export type AssignmentTypeId =
  | "BIBLE_READING"
  | "START_CONVERSATION"
  | "MAKE_RETURN_VISIT"
  | "BIBLE_STUDY"
  | "EXPLAIN_BELIEFS"
  | "MAKE_DISCIPLES"
  | "TALK"
  | "OTHER"
  // Fase 3: resto de la reunión (aditivo, no altera SMM).
  | "CHAIRMAN"
  | "OPENING_COMMENTS"
  | "OPENING_PRAYER"
  | "TREASURES_TALK"
  | "SPIRITUAL_GEMS"
  | "CHRISTIAN_LIVING"
  | "CONGREGATION_BIBLE_STUDY_CONDUCTOR"
  | "CONGREGATION_BIBLE_STUDY_READER"
  | "CONCLUDING_COMMENTS"
  | "CLOSING_PRAYER"
  | "SONG";

export interface AssignmentTypeRule {
  type: AssignmentTypeId;
  label: string;
  section: SectionId;
  defaultTitle: string;
  defaultDurationMinutes: number;
  /** Si la parte normalmente lleva acompañante (ayudante). */
  needsCompanion: boolean;
  /** Géneros permitidos para el asignado principal. [] = sin restricción. */
  allowedAssigneeGenders: GenderValue[];
  /** Si el acompañante debe ser del mismo género que el asignado. */
  companionSameGender: boolean;
}

/**
 * Tabla de reglas por tipo.
 *
 * Reglas explícitas aprobadas:
 *  - Lectura de la Biblia y Discurso: solo hombres, sin acompañante.
 *  - Partes de estudiante (conversaciones, revisitas, curso, etc.): llevan
 *    acompañante y el acompañante debe ser del mismo género que el estudiante.
 */
export const ASSIGNMENT_TYPE_RULES: Record<AssignmentTypeId, AssignmentTypeRule> = {
  BIBLE_READING: {
    type: "BIBLE_READING",
    label: "Lectura de la Biblia",
    section: "BIBLE_READING",
    defaultTitle: "Lectura de la Biblia",
    defaultDurationMinutes: 4,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  START_CONVERSATION: {
    type: "START_CONVERSATION",
    label: "Empiece conversaciones",
    section: "APPLY_YOURSELF",
    defaultTitle: "Empiece conversaciones",
    defaultDurationMinutes: 3,
    needsCompanion: true,
    allowedAssigneeGenders: [],
    companionSameGender: true,
  },
  MAKE_RETURN_VISIT: {
    type: "MAKE_RETURN_VISIT",
    label: "Haga revisitas",
    section: "APPLY_YOURSELF",
    defaultTitle: "Haga revisitas",
    defaultDurationMinutes: 4,
    needsCompanion: true,
    allowedAssigneeGenders: [],
    companionSameGender: true,
  },
  BIBLE_STUDY: {
    type: "BIBLE_STUDY",
    label: "Curso bíblico",
    section: "APPLY_YOURSELF",
    defaultTitle: "Curso bíblico",
    defaultDurationMinutes: 5,
    needsCompanion: true,
    allowedAssigneeGenders: [],
    companionSameGender: true,
  },
  EXPLAIN_BELIEFS: {
    type: "EXPLAIN_BELIEFS",
    label: "Explique sus creencias",
    section: "APPLY_YOURSELF",
    defaultTitle: "Explique sus creencias",
    defaultDurationMinutes: 5,
    needsCompanion: true,
    allowedAssigneeGenders: [],
    companionSameGender: true,
  },
  MAKE_DISCIPLES: {
    type: "MAKE_DISCIPLES",
    label: "Haga discípulos",
    section: "APPLY_YOURSELF",
    defaultTitle: "Haga discípulos",
    defaultDurationMinutes: 5,
    needsCompanion: true,
    allowedAssigneeGenders: [],
    companionSameGender: true,
  },
  TALK: {
    type: "TALK",
    label: "Discurso",
    section: "APPLY_YOURSELF",
    defaultTitle: "Discurso",
    defaultDurationMinutes: 5,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  OTHER: {
    type: "OTHER",
    label: "Otra asignación",
    section: "APPLY_YOURSELF",
    defaultTitle: "Otra asignación",
    defaultDurationMinutes: 5,
    needsCompanion: false,
    allowedAssigneeGenders: [],
    companionSameGender: false,
  },
  // ─── Fase 3: resto de la reunión. Todas sin acompañante y solo hombres
  // (coherente con las capacidades maleOnly). SONG es informativa (no asignable).
  CHAIRMAN: {
    type: "CHAIRMAN",
    label: "Presidente",
    section: "OPENING",
    defaultTitle: "Presidente de la reunión",
    defaultDurationMinutes: 0,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  OPENING_COMMENTS: {
    type: "OPENING_COMMENTS",
    label: "Palabras de introducción",
    section: "OPENING",
    defaultTitle: "Palabras de introducción",
    defaultDurationMinutes: 1,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  OPENING_PRAYER: {
    type: "OPENING_PRAYER",
    label: "Oración inicial",
    section: "OPENING",
    defaultTitle: "Oración inicial",
    defaultDurationMinutes: 0,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  TREASURES_TALK: {
    type: "TREASURES_TALK",
    label: "Tesoros de la Biblia",
    section: "TREASURES",
    defaultTitle: "Tesoros de la Biblia",
    defaultDurationMinutes: 10,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  SPIRITUAL_GEMS: {
    type: "SPIRITUAL_GEMS",
    label: "Busquemos perlas escondidas",
    section: "TREASURES",
    defaultTitle: "Busquemos perlas escondidas",
    defaultDurationMinutes: 10,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  CHRISTIAN_LIVING: {
    type: "CHRISTIAN_LIVING",
    label: "Nuestra Vida Cristiana",
    section: "LIVING_AS_CHRISTIANS",
    defaultTitle: "Nuestra Vida Cristiana",
    defaultDurationMinutes: 15,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  CONGREGATION_BIBLE_STUDY_CONDUCTOR: {
    type: "CONGREGATION_BIBLE_STUDY_CONDUCTOR",
    label: "Estudio Bíblico de la Congregación (conductor)",
    section: "LIVING_AS_CHRISTIANS",
    defaultTitle: "Estudio bíblico de la congregación",
    defaultDurationMinutes: 30,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  CONGREGATION_BIBLE_STUDY_READER: {
    type: "CONGREGATION_BIBLE_STUDY_READER",
    label: "Estudio Bíblico de la Congregación (lector)",
    section: "LIVING_AS_CHRISTIANS",
    defaultTitle: "Lector del estudio bíblico de la congregación",
    defaultDurationMinutes: 0,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  CONCLUDING_COMMENTS: {
    type: "CONCLUDING_COMMENTS",
    label: "Palabras de conclusión",
    section: "CONCLUSION",
    defaultTitle: "Palabras de conclusión",
    defaultDurationMinutes: 3,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  CLOSING_PRAYER: {
    type: "CLOSING_PRAYER",
    label: "Oración final",
    section: "CONCLUSION",
    defaultTitle: "Oración final",
    defaultDurationMinutes: 0,
    needsCompanion: false,
    allowedAssigneeGenders: ["MALE"],
    companionSameGender: false,
  },
  SONG: {
    type: "SONG",
    label: "Canción",
    section: "OPENING",
    defaultTitle: "Canción",
    defaultDurationMinutes: 0,
    needsCompanion: false,
    allowedAssigneeGenders: [],
    companionSameGender: false,
  },
};

export function getAssignmentTypeRule(type: string): AssignmentTypeRule {
  return ASSIGNMENT_TYPE_RULES[type as AssignmentTypeId] ?? ASSIGNMENT_TYPE_RULES.OTHER;
}

export function deriveSection(type: string): SectionId {
  return getAssignmentTypeRule(type).section;
}

export function deriveTitle(type: string): string {
  return getAssignmentTypeRule(type).defaultTitle;
}

export function deriveDurationMinutes(type: string): number {
  return getAssignmentTypeRule(type).defaultDurationMinutes;
}

export function typeNeedsCompanion(type: string): boolean {
  return getAssignmentTypeRule(type).needsCompanion;
}

/**
 * ¿Puede una persona de este género recibir este tipo de asignación?
 * Conservador: si el género es desconocido (null/undefined) NO se bloquea,
 * para no romper datos existentes sin género capturado.
 */
export function isAssigneeGenderAllowed(type: string, gender: GenderValue | null | undefined): boolean {
  const rule = getAssignmentTypeRule(type);
  if (rule.allowedAssigneeGenders.length === 0) return true;
  if (!gender) return true;
  return rule.allowedAssigneeGenders.includes(gender);
}

/**
 * ¿Es válido este acompañante para el asignado en este tipo de parte?
 * Conservador: si falta algún género, no se bloquea.
 */
export function isCompanionGenderAllowed(
  type: string,
  assigneeGender: GenderValue | null | undefined,
  companionGender: GenderValue | null | undefined,
): boolean {
  const rule = getAssignmentTypeRule(type);
  if (!rule.companionSameGender) return true;
  if (!assigneeGender || !companionGender) return true;
  return assigneeGender === companionGender;
}

export type AssignmentRole = "ASSIGNEE" | "COMPANION";

/** Forma mínima de un publicador para evaluar elegibilidad. */
export interface EligibilityPublisher {
  isActive?: boolean;
  deletedAt?: Date | string | null;
  canReceiveAssignments?: boolean;
  canBeCompanion?: boolean;
  gender?: GenderValue | null;
  // ─── Capacidades usadas por el generador (Fase 2) ───
  // Si vienen `undefined` se mantiene el comportamiento anterior (solo la regla
  // de género), para no romper llamadas/datos legacy que no las proveen.
  canBibleReading?: boolean;
  canGiveTalk?: boolean;
  canParticipateSMM?: boolean;
  // ─── Capacidades de partes de reunión (Fase 3) ───
  canBeChairman?: boolean;
  canTreasures?: boolean;
  canSpiritualGems?: boolean;
  canChristianLife?: boolean;
  canConductCBS?: boolean;
  canReadCBS?: boolean;
}

/** Capacidad de publicador que un tipo de asignación puede requerir. */
export type RequiredCapability =
  | "canBibleReading"
  | "canGiveTalk"
  | "canParticipateSMM"
  | "canBeChairman"
  | "canTreasures"
  | "canSpiritualGems"
  | "canChristianLife"
  | "canConductCBS"
  | "canReadCBS";

/**
 * Capacidad requerida por tipo de asignación. `null` = sin capacidad específica
 * (o parte informativa como SONG, que no se asigna). El backend bloquea asignar
 * a quien tenga la capacidad requerida explícitamente en `false`.
 */
export const ASSIGNMENT_TYPE_REQUIRED_CAPABILITY: Record<
  AssignmentTypeId,
  RequiredCapability | null
> = {
  BIBLE_READING: "canBibleReading",
  START_CONVERSATION: "canParticipateSMM",
  MAKE_RETURN_VISIT: "canParticipateSMM",
  BIBLE_STUDY: "canParticipateSMM",
  EXPLAIN_BELIEFS: "canParticipateSMM",
  MAKE_DISCIPLES: "canParticipateSMM",
  TALK: "canGiveTalk",
  OTHER: null,
  // ─── Fase 3 ───
  // "Ser presidente" implica automáticamente oración inicial, oración final y
  // palabras de conclusión: esas tres partes se deciden con canBeChairman.
  CHAIRMAN: "canBeChairman",
  OPENING_COMMENTS: "canBeChairman",
  OPENING_PRAYER: "canBeChairman",
  TREASURES_TALK: "canTreasures",
  SPIRITUAL_GEMS: "canSpiritualGems",
  CHRISTIAN_LIVING: "canChristianLife",
  CONGREGATION_BIBLE_STUDY_CONDUCTOR: "canConductCBS",
  CONGREGATION_BIBLE_STUDY_READER: "canReadCBS",
  CONCLUDING_COMMENTS: "canBeChairman",
  CLOSING_PRAYER: "canBeChairman",
  SONG: null,
};

/** Capacidad requerida por el tipo, o null si no aplica. */
export function requiredCapabilityForType(type: string): RequiredCapability | null {
  return ASSIGNMENT_TYPE_REQUIRED_CAPABILITY[type as AssignmentTypeId] ?? null;
}

/** ¿Es una parte informativa (no asignable), como una canción? */
export function isInformationalType(type: string): boolean {
  return type === "SONG";
}

export interface AssignmentTypeOption {
  value: AssignmentTypeId;
  label: string;
}

/**
 * Opciones de tipo de asignación para formularios/selects. Excluye SONG (no es
 * asignable; es informativa). El orden refleja el flujo de la reunión.
 */
export const ASSIGNMENT_TYPE_OPTIONS: AssignmentTypeOption[] = (
  [
    "CHAIRMAN",
    "OPENING_COMMENTS",
    "OPENING_PRAYER",
    "TREASURES_TALK",
    "SPIRITUAL_GEMS",
    "BIBLE_READING",
    "START_CONVERSATION",
    "MAKE_RETURN_VISIT",
    "BIBLE_STUDY",
    "EXPLAIN_BELIEFS",
    "MAKE_DISCIPLES",
    "TALK",
    "CHRISTIAN_LIVING",
    "CONGREGATION_BIBLE_STUDY_CONDUCTOR",
    "CONGREGATION_BIBLE_STUDY_READER",
    "CONCLUDING_COMMENTS",
    "CLOSING_PRAYER",
    "OTHER",
  ] as AssignmentTypeId[]
).map((type) => ({ value: type, label: ASSIGNMENT_TYPE_RULES[type].label }));

/**
 * Función central de elegibilidad. ÚNICA fuente de verdad para decidir si un
 * publicador puede recibir una asignación (o ser acompañante) de cierto tipo.
 *
 * Reglas:
 *  - Debe estar activo y no borrado.
 *  - Debe poder recibir asignaciones (el acompañante también recibe una parte).
 *  - Si el rol es COMPANION, debe tener canBeCompanion.
 *  - Capacidad de la parte (Fase 2): si el tipo requiere una capacidad y el
 *    publicador la tiene explícitamente en `false`, no es elegible (aplica a
 *    asignado y acompañante, porque el acompañante de una parte de estudiante
 *    también participa en Seamos Mejores Maestros). Si la capacidad viene
 *    `undefined`, no se bloquea (retrocompatibilidad con datos legacy).
 *  - Si el rol es ASSIGNEE, debe respetar el género permitido por el tipo
 *    (Lectura de la Biblia y Discurso solo hombres). El género desconocido no
 *    se bloquea (conservador con datos existentes sin género capturado).
 *
 * La regla de "acompañante del mismo género que el asignado" NO se evalúa aquí
 * porque depende del asignado; se valida con `isCompanionGenderAllowed`.
 */
export function isPublisherEligibleForAssignment(
  publisher: EligibilityPublisher,
  assignmentType: string,
  role: AssignmentRole = "ASSIGNEE",
): boolean {
  if (publisher.isActive === false) return false;
  if (publisher.deletedAt) return false;
  if (publisher.canReceiveAssignments === false) return false;
  if (role === "COMPANION" && publisher.canBeCompanion === false) return false;

  const capField = requiredCapabilityForType(assignmentType);
  if (capField && publisher[capField] === false) return false;

  if (role === "ASSIGNEE" && !isAssigneeGenderAllowed(assignmentType, publisher.gender)) return false;
  return true;
}

/**
 * Valida los géneros de una asignación. Devuelve un mensaje de error en
 * español si la combinación es inválida, o null si es válida.
 */
export function validateAssignmentGenders(input: {
  assignmentType: string;
  assignedGender: GenderValue | null | undefined;
  companionGender?: GenderValue | null | undefined;
}): string | null {
  const rule = getAssignmentTypeRule(input.assignmentType);

  if (!isAssigneeGenderAllowed(input.assignmentType, input.assignedGender)) {
    return `${rule.label} solo puede asignarse a hombres.`;
  }

  if (
    input.companionGender != null &&
    !isCompanionGenderAllowed(input.assignmentType, input.assignedGender, input.companionGender)
  ) {
    return `El acompañante de "${rule.label}" debe ser del mismo género que el asignado.`;
  }

  return null;
}
