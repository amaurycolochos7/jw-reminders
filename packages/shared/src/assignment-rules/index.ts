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
export type SectionId = "BIBLE_READING" | "APPLY_YOURSELF";
export type RoomId = "MAIN" | "AUXILIARY";
export type AssignmentTypeId =
  | "BIBLE_READING"
  | "START_CONVERSATION"
  | "MAKE_RETURN_VISIT"
  | "BIBLE_STUDY"
  | "EXPLAIN_BELIEFS"
  | "MAKE_DISCIPLES"
  | "TALK"
  | "OTHER";

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
