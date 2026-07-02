/**
 * Generador ÚNICO de los mensajes de WhatsApp (fuente de verdad del texto).
 *
 * El sistema usa SOLO cuatro mensajes activos:
 *   1. Aviso inicial mensual  → buildMonthlyInitialMessage  (SIN hora)
 *   2. Recordatorio 7 días     → buildGroupedPersonMessage  (CON hora)
 *   3. Recordatorio 3 días     → buildGroupedPersonMessage  (CON hora)
 *   4. Recordatorio 1 día      → buildGroupedPersonMessage  (CON hora)
 *
 * (El recordatorio del "mismo día" NO existe y no debe reintroducirse.)
 *
 * Núcleo PURO (sin efectos ni acceso a DB): el worker y el preview del panel
 * consumen estos helpers para construir exactamente el mismo texto.
 *
 * Reglas de formato (WhatsApp Markdown):
 *  - Negritas con *asterisco* SIN espacio pegado por dentro y con espacio por
 *    fuera. Nunca `*texto *` ni `Etiqueta:*texto*`; siempre `Etiqueta: *texto*`.
 *  - Cada parte muestra información COMPLETA: número de punto, sección, título
 *    real y duración; y en Seamos Mejores Maestros además rol y acompañante /
 *    estudiante.
 *  - Bloques opcionales (título, acompañante, estudiante) solo se imprimen si
 *    existen; nunca se generan líneas vacías ni etiquetas huérfanas.
 */

/** Frase de bendición de cierre, común a los cuatro mensajes. */
export const BLESSING_LINE =
  "Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.";

/**
 * Formatea una hora "HH:mm" (24h) a "h:mm a.m./p.m." en español. Si el valor no
 * coincide con ese formato, se devuelve tal cual (no se inventa nada).
 */
export function formatMeetingTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return time;
  const hour24 = Number(m[1]);
  const minutes = m[2];
  if (hour24 < 0 || hour24 > 23) return time;
  const period = hour24 < 12 ? "a.m." : "p.m.";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minutes} ${period}`;
}

/** Pone en mayúscula la primera letra (p. ej. "viernes 10..." -> "Viernes 10..."). */
function capitalize(s: string): string {
  return s.length ? s[0].toLocaleUpperCase("es") + s.slice(1) : s;
}

/**
 * Encabezado de fecha para el mensaje: quita la coma que es-MX inserta tras el
 * día de la semana ("viernes, 24 de julio" -> "Viernes 24 de julio") y capitaliza.
 */
function dateHeader(text: string): string {
  return capitalize(text.trim().replace(/^(\p{L}+),\s+/u, "$1 "));
}

/**
 * Normaliza para comparar: minúsculas, sin acentos, sin paréntesis (p. ej.
 * "(conductor)"), sin puntuación y con espacios colapsados.
 */
function stripForCompare(s: string): string {
  return s
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿El título repite lo mismo que la sección y por tanto NO debe imprimirse?
 * Se ignoran mayúsculas, acentos y sufijos entre paréntesis, de modo que
 * "Estudio bíblico de la congregación" es redundante con
 * "Estudio Bíblico de la Congregación (conductor)".
 */
function isRedundantTitle(title: string | null | undefined, section: string): boolean {
  if (!title) return true;
  const t = stripForCompare(title);
  if (!t) return true;
  return t === stripForCompare(section);
}

/** "10 minutos", "1 minuto"; null si no aplica (0 o ausente). */
function durationLine(min?: number | null): string | null {
  if (min == null || min <= 0) return null;
  return `${min} ${min === 1 ? "minuto" : "minutos"}`;
}

/**
 * Datos de UNA parte asignada a la persona destinataria. Se comparte por los
 * cuatro mensajes para garantizar una estructura visual idéntica.
 */
export interface MessagePart {
  /** Orden dentro del programa de la semana (para ordenar la lista). */
  sortOrder: number;
  /** Número del punto en el programa (WOL). Si no existe, no se muestra "Punto N". */
  pointNumber?: number | null;
  /** Etiqueta de la sección / tipo de parte (p. ej. "Tesoros de la Biblia"). */
  sectionLabel: string;
  /** Título real de la parte (p. ej. "Predique con valor"). */
  title?: string | null;
  /** Duración en minutos, si aplica (>0). */
  durationMinutes?: number | null;
  /** True si la parte es de "Seamos Mejores Maestros" (lleva rol y acompañante). */
  isApplyYourself?: boolean;
  /** Rol del destinatario en la parte. */
  recipientRole?: "ASSIGNED" | "COMPANION" | null;
  /** Nombre del acompañante (para mostrar al estudiante principal). */
  companionName?: string | null;
  /** Nombre del estudiante principal (para mostrar al acompañante). */
  assignedName?: string | null;
}

/**
 * Construye las líneas de UNA parte. Estructura:
 *
 *   • Punto {n}
 *   *{sección}*
 *   {título real}          (solo si difiere de la sección)
 *   {n} minutos            (solo si hay duración)
 *   Como estudiante|ayudante   (solo Seamos Mejores Maestros)
 *   Acompañante:|Estudiante:   (solo si existe la contraparte)
 *   {nombre}
 */
export function renderPartLines(part: MessagePart, opts: { showDuration?: boolean } = {}): string[] {
  const lines: string[] = [];
  const label = `*${part.sectionLabel.trim()}*`;

  if (part.pointNumber != null && part.pointNumber > 0) {
    lines.push(`• Punto ${part.pointNumber}`);
    lines.push(label);
  } else {
    lines.push(`• ${label}`);
  }

  // Título real: solo si aporta algo distinto a la sección (sin repetir).
  if (!isRedundantTitle(part.title, part.sectionLabel)) {
    lines.push(part.title!.trim());
  }

  if (opts.showDuration !== false) {
    const dur = durationLine(part.durationMinutes);
    if (dur) lines.push(dur);
  }

  if (part.isApplyYourself) {
    // Seamos Mejores Maestros: rol + contraparte, según el destinatario.
    if (part.recipientRole === "COMPANION") {
      lines.push("Como ayudante");
      const student = part.assignedName?.trim();
      if (student) {
        lines.push("Estudiante:");
        lines.push(student);
      }
    } else {
      lines.push("Como estudiante");
      const companion = part.companionName?.trim();
      if (companion) {
        lines.push("Acompañante:");
        lines.push(companion);
      }
    }
  } else {
    // Parte que no es de estudiante pero excepcionalmente tenga acompañante.
    const companion = part.companionName?.trim();
    if (companion) {
      lines.push("Acompañante:");
      lines.push(companion);
    }
  }

  return lines;
}

/** Une bloques de partes separados por una línea en blanco, sin dejar huecos dobles. */
function appendParts(lines: string[], parts: MessagePart[], opts: { showDuration?: boolean } = {}): void {
  const ordered = [...parts].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const p of ordered) {
    lines.push("");
    for (const l of renderPartLines(p, opts)) lines.push(l);
  }
}

// ─── 1) AVISO INICIAL MENSUAL (SIN hora) ─────────────────────────────────────

export interface MonthlyInitialItem extends MessagePart {
  /** Fecha de la reunión ya formateada (p. ej. "viernes 10 de julio de 2026"). */
  meetingDateText: string;
  /** Clave para ordenar por fecha (p. ej. "2026-07-10"). */
  sortDate: string;
}

export interface MonthlyInitialInput {
  personName: string;
  /** Nombre del mes en minúscula, p. ej. "julio". */
  monthName: string;
  items: MonthlyInitialItem[];
  /** Mostrar la duración de cada parte. Por defecto true. */
  showDuration?: boolean;
}

/**
 * Aviso inicial mensual: un solo mensaje por persona con TODAS sus asignaciones
 * del mes, agrupadas por fecha de reunión. NO incluye la hora de la reunión.
 */
export function buildMonthlyInitialMessage(input: MonthlyInitialInput): string {
  const byDate = new Map<string, { text: string; sortDate: string; items: MonthlyInitialItem[] }>();
  for (const it of input.items) {
    const g = byDate.get(it.meetingDateText) ?? { text: it.meetingDateText, sortDate: it.sortDate, items: [] };
    g.items.push(it);
    byDate.set(it.meetingDateText, g);
  }
  const dates = [...byDate.values()].sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  const lines: string[] = [];
  lines.push(`Hola ${input.personName.trim()}.`);
  lines.push("");
  lines.push(`Le compartimos sus asignaciones para las reuniones del mes de ${input.monthName}.`);

  for (const d of dates) {
    lines.push("");
    lines.push(`*${dateHeader(d.text)}*`); // fecha en negrita, SIN hora
    appendParts(lines, d.items, { showDuration: input.showDuration !== false });
  }

  lines.push("");
  lines.push(BLESSING_LINE);
  return lines.join("\n");
}

// ─── 2/3/4) RECORDATORIOS 7d / 3d / 1d (CON hora) ────────────────────────────

export interface GroupedPersonMessageInput {
  personName: string;
  /** Fecha de la reunión ya formateada (p. ej. "viernes 31 de julio de 2026"). */
  meetingDateText: string;
  /** Hora de la reunión "HH:mm" (24h) o ya formateada; se muestra en 12h. */
  meetingTimeText?: string | null;
  parts: MessagePart[];
  /** Mostrar la hora de la reunión. Por defecto true. El recordatorio de 7 días la omite. */
  showTime?: boolean;
  /** Mostrar la duración de cada parte. Por defecto true. El recordatorio de 7 días la omite. */
  showDuration?: boolean;
}

/**
 * Recordatorio (7/3/1 días): una persona con una o varias partes en la misma
 * reunión recibe UN solo mensaje. Misma estructura que el aviso inicial.
 * El recordatorio de 7 días omite hora y duración (`showTime`/`showDuration`).
 */
export function buildGroupedPersonMessage(input: GroupedPersonMessageInput): string {
  const parts = [...input.parts].sort((a, b) => a.sortOrder - b.sortOrder);
  const lines: string[] = [];
  lines.push(`Hola ${input.personName.trim()}.`);
  lines.push("");
  lines.push(
    parts.length > 1
      ? "Le recordamos sus asignaciones para la próxima reunión:"
      : "Le recordamos su asignación para la próxima reunión:",
  );
  lines.push("");
  lines.push(`*${dateHeader(input.meetingDateText)}*`);
  if (input.showTime !== false) {
    const time = formatMeetingTime(input.meetingTimeText ?? null);
    if (time) lines.push(time);
  }

  appendParts(lines, parts, { showDuration: input.showDuration !== false });

  lines.push("");
  lines.push(BLESSING_LINE);
  return lines.join("\n");
}
