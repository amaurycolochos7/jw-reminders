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

  return lines.join("\n");
}
