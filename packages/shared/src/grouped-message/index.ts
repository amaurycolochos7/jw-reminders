/**
 * Agrupación de mensajes por persona y semana (Fase 3).
 *
 * Núcleo PURO (sin efectos ni dependencias): construye el texto de un único
 * mensaje que lista todas las partes que una persona tiene en la misma reunión.
 * El worker agrupa los `ReminderDelivery` hermanos (misma persona + misma semana
 * + mismo tipo de recordatorio) y usa este helper para el cuerpo.
 *
 * Reglas:
 *  - Varias partes  → un solo mensaje con lista de partes (ordenadas por orden
 *    de programa).
 *  - Una sola parte → mensaje individual equivalente (sin lista con viñetas).
 *  - La hora de reunión se incluye si se conoce.
 */

export interface GroupedPart {
  /** Título de la parte tal como se mostrará (p. ej. "Presidente"). */
  title: string;
  /** Orden dentro del programa de la semana (para ordenar la lista). */
  sortOrder: number;
}

export interface GroupedPersonMessageInput {
  /** Nombre de pila / display de la persona. */
  personName: string;
  /** Fecha de la reunión ya formateada en español (p. ej. "viernes 3 de julio"). */
  meetingDateText: string;
  /** Hora de la reunión ya formateada (p. ej. "7:00 p.m."). Opcional. */
  meetingTimeText?: string | null;
  /** Partes asignadas a la persona en esa semana. */
  parts: GroupedPart[];
  /**
   * Si es true, añade una línea animando a prepararse con anticipación (Opción A).
   * Se usa solo para el AVISO INICIAL agrupado, no para los recordatorios, igual
   * que en las plantillas individuales.
   */
  includeEncouragement?: boolean;
}

/** Texto de ánimo (Opción A) para el aviso inicial agrupado. */
const GROUPED_ENCOURAGEMENT =
  "Le animamos a prepararse con anticipación para hacer sus asignaciones de la mejor manera. ¡Jehová bendecirá su esfuerzo!";

/** Frase de bendición de cierre para recordatorios y avisos (sin puntualidad). */
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

/**
 * Construye el mensaje agrupado. Determinista y sin efectos.
 */
export function buildGroupedPersonMessage(input: GroupedPersonMessageInput): string {
  const parts = [...input.parts].sort((a, b) => a.sortOrder - b.sortOrder);
  const lines: string[] = [];
  lines.push(`Hola ${input.personName}.`);

  if (parts.length <= 1) {
    const title = parts[0]?.title ?? "una asignación";
    lines.push(`Le recordamos su asignación para la reunión del ${input.meetingDateText}:`);
    lines.push(title + ".");
  } else {
    lines.push(`Estas son sus asignaciones para la reunión del ${input.meetingDateText}:`);
    for (const part of parts) {
      lines.push(`• ${part.title}.`);
    }
  }

  const time = formatMeetingTime(input.meetingTimeText ?? null);
  if (time) {
    lines.push(`Hora de reunión: ${time}.`);
  }

  // Ánimo a prepararse con anticipación (solo aviso inicial agrupado).
  if (input.includeEncouragement) {
    lines.push(GROUPED_ENCOURAGEMENT);
  }

  // Cierre con bendición en todos los recordatorios agrupados.
  lines.push(BLESSING_LINE);

  return lines.join("\n");
}

// ─── Aviso inicial MENSUAL ───────────────────────────────
// Un solo mensaje por persona con TODAS sus asignaciones del mes, agrupadas por
// fecha de reunión. Marca las partes en las que participa como acompañante.

export interface MonthlyInitialItem {
  /** Fecha de la reunión ya formateada en español (p. ej. "viernes 10 de julio"). */
  meetingDateText: string;
  /** Clave para ordenar por fecha (p. ej. "2026-07-10"). */
  sortDate: string;
  /** Orden de la parte dentro del programa de esa semana. */
  sortOrder: number;
  /** Título de la parte. */
  title: string;
  /** True si participa como acompañante. */
  isCompanion?: boolean;
}

export interface MonthlyInitialInput {
  personName: string;
  /** Etiqueta del mes, p. ej. "Julio 2026". */
  monthLabel: string;
  items: MonthlyInitialItem[];
}

/**
 * Construye el aviso inicial MENSUAL. Determinista y sin efectos.
 * Agrupa las asignaciones por fecha de reunión y las ordena por fecha y por el
 * orden del programa. No incluye recordatorios de puntualidad.
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
  lines.push(`Hola ${input.personName}.`);
  lines.push("");
  lines.push(`Estas son sus asignaciones para las reuniones de ${input.monthLabel}:`);
  for (const d of dates) {
    lines.push("");
    lines.push(`📅 ${d.text}`);
    const parts = [...d.items].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const p of parts) {
      lines.push(`   • ${p.title}${p.isCompanion ? " (como acompañante)" : ""}`);
    }
  }
  lines.push("");
  lines.push("Le invitamos a prepararse con anticipación para cada una.");
  lines.push(BLESSING_LINE);

  return lines.join("\n");
}
