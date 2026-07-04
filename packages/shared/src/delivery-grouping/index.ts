/**
 * Agrupación de entregas por persona + semana + bucket (o persona + MES para el
 * aviso inicial). Núcleo PURO y CANÓNICO: lo usan tanto el congelado del snapshot
 * (API) como el envío (worker), de modo que el mensaje se agrupa IGUAL al generar
 * y al enviar. Un solo mensaje por grupo.
 *
 * groupKey = `${publisherId}|${meetingWeekId}|${reminderType}`
 * Excepción INITIAL_NOTICE: `${publisherId}|month:${monthlyScheduleId}|INITIAL_NOTICE`.
 */

export interface GroupableDelivery {
  publisherId: string;
  reminderType: string;
  assignment: { meetingWeekId: string; meetingWeek?: { monthlyScheduleId?: string | null } | null };
}

export function groupKey(d: GroupableDelivery): string {
  if (d.reminderType === "INITIAL_NOTICE") {
    const month = d.assignment.meetingWeek?.monthlyScheduleId ?? d.assignment.meetingWeekId;
    return `${d.publisherId}|month:${month}|INITIAL_NOTICE`;
  }
  return `${d.publisherId}|${d.assignment.meetingWeekId}|${d.reminderType}`;
}

/** Parte el lote en grupos, preservando el orden de aparición del primer miembro. */
export function groupDeliveries<T extends GroupableDelivery>(deliveries: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const d of deliveries) {
    const key = groupKey(d);
    const existing = groups.get(key);
    if (existing) existing.push(d);
    else groups.set(key, [d]);
  }
  return [...groups.values()];
}
