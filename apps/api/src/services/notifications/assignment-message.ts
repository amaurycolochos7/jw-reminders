/**
 * Render puro de los mensajes de asignación de Vida y Ministerio (FASE 2).
 *
 * No envía nada ni toca la base de datos: construye el texto exacto de:
 *  - primer mensaje completo para el participante PRINCIPAL,
 *  - primer mensaje completo para el ACOMPAÑANTE,
 *  - recordatorio corto (para ambos),
 * aplicando las reglas de formato del spec:
 *  - assignmentLabel = "4. Título" si hay itemNumber, si no sólo el título.
 *  - contextLine sólo aparece si hay contexto.
 *  - assistantLine sólo aparece si hay acompañante.
 *  - referenceAndLesson une reference y lesson con "; " si ambos existen.
 *  - no se genera mensaje si falta el participante principal.
 *  - si requiresAssistant y no hay acompañante, se registra una advertencia.
 */

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-06-29", "2026-07-05" → "29 de junio a 5 de julio". */
export function formatWeekLabel(weekStartLocal: string, weekEndLocal: string): string {
  const parse = (v: string) => {
    const [y, m, d] = v.split("T")[0].split("-").map(Number);
    return { d, month: MONTHS[m - 1] };
  };
  const a = parse(weekStartLocal);
  const b = parse(weekEndLocal);
  return `${a.d} de ${a.month} a ${b.d} de ${b.month}`;
}

/** "PREDICACIÓN INFORMAL" → "Predicación informal" (sentence case). */
function sentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase("es");
  return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
}

export interface AssignmentMessageInput {
  itemNumber?: number | null;
  title: string;
  durationMinutes?: number | null;
  context?: string | null;
  description?: string | null;
  reference?: string | null;
  lesson?: string | null;
  requiresAssistant: boolean;
  weekLabel: string;
  primaryName?: string | null;
  assistantName?: string | null;
}

export interface AssignmentMessageVariables {
  primaryName: string;
  assistantName: string;
  weekLabel: string;
  assignmentLabel: string;
  durationMinutes: string;
  contextLine: string;
  description: string;
  referenceAndLesson: string;
  assistantLine: string;
}

export function buildMessageVariables(input: AssignmentMessageInput): AssignmentMessageVariables {
  const assignmentLabel = input.itemNumber != null ? `${input.itemNumber}. ${input.title}` : input.title;
  const contextLine = input.context ? `📍 Contexto: ${sentenceCase(input.context)}` : "";
  const refParts = [input.reference, input.lesson].filter((v): v is string => !!v && v.trim().length > 0);
  const referenceAndLesson = refParts.join("; ");
  const assistantLine = input.assistantName ? `👥 Acompañante: ${input.assistantName}` : "";
  return {
    primaryName: input.primaryName ?? "",
    assistantName: input.assistantName ?? "",
    weekLabel: input.weekLabel,
    assignmentLabel,
    durationMinutes: input.durationMinutes != null ? String(input.durationMinutes) : "",
    contextLine,
    description: input.description ?? "",
    referenceAndLesson,
    assistantLine,
  };
}

/** Une líneas saltando las opcionales vacías (evita huecos dobles). */
function joinLines(lines: Array<string | null | undefined>): string {
  return lines.filter((l) => l !== null && l !== undefined && l !== "__SKIP__").join("\n");
}

function primaryFirstNotice(v: AssignmentMessageVariables): string {
  return joinLines([
    `Hola ${v.primaryName}, se te ha asignado una participación en la reunión de entre semana.`,
    "",
    `📅 Semana: ${v.weekLabel}`,
    `🎤 Asignación: ${v.assignmentLabel}`,
    `⏱ Duración: ${v.durationMinutes} minutos`,
    v.contextLine || "__SKIP__",
    `📘 Instrucción: ${v.description}`,
    `📖 Referencia: ${v.referenceAndLesson}`,
    "",
    `👤 Participante principal: ${v.primaryName}`,
    v.assistantLine || "__SKIP__",
    "",
    "Por favor confirma que recibiste esta asignación.",
  ]);
}

function companionFirstNotice(v: AssignmentMessageVariables): string {
  return joinLines([
    `Hola ${v.assistantName}, se te ha asignado participar como acompañante en la reunión de entre semana.`,
    "",
    `📅 Semana: ${v.weekLabel}`,
    `🎤 Asignación: ${v.assignmentLabel}`,
    `⏱ Duración: ${v.durationMinutes} minutos`,
    v.contextLine || "__SKIP__",
    `📘 Instrucción: ${v.description}`,
    `📖 Referencia: ${v.referenceAndLesson}`,
    "",
    `👤 Participante principal: ${v.primaryName}`,
    `👥 Acompañante: ${v.assistantName}`,
    "",
    "Por favor confirma que recibiste esta asignación.",
  ]);
}

function shortReminder(v: AssignmentMessageVariables): string {
  return joinLines([
    "Recordatorio de asignación:",
    "",
    `📅 Semana: ${v.weekLabel}`,
    `🎤 ${v.assignmentLabel}`,
    `⏱ ${v.durationMinutes} minutos`,
    `👤 Principal: ${v.primaryName}`,
    v.assistantLine || "__SKIP__",
  ]);
}

export interface AssignmentMessages {
  /** Mensaje al principal (null si falta el principal → no se envía). */
  primaryFirstNotice: string | null;
  /** Mensaje al acompañante (null si no hay acompañante). */
  companionFirstNotice: string | null;
  /** Recordatorio corto para el principal (null si falta el principal). */
  reminder: string | null;
  warnings: string[];
}

/**
 * Construye todos los mensajes de una asignación aplicando las reglas del spec.
 */
export function buildAssignmentMessages(input: AssignmentMessageInput): AssignmentMessages {
  const warnings: string[] = [];

  if (!input.primaryName) {
    warnings.push("No se envía mensaje: falta el participante principal.");
    return { primaryFirstNotice: null, companionFirstNotice: null, reminder: null, warnings };
  }

  if (input.requiresAssistant && !input.assistantName) {
    warnings.push(`La asignación "${input.title}" requiere acompañante y no tiene uno asignado.`);
  }

  const v = buildMessageVariables(input);
  return {
    primaryFirstNotice: primaryFirstNotice(v),
    companionFirstNotice: input.assistantName ? companionFirstNotice(v) : null,
    reminder: shortReminder(v),
    warnings,
  };
}
