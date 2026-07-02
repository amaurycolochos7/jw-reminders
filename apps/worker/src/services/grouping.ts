/**
 * Agrupación de ReminderDelivery por persona + semana + bucket (Fase 3, Opción A).
 *
 * Núcleo PURO (sin efectos ni acceso a DB) para poder razonar/testear la
 * partición sin base de datos. El worker consume estos helpers para decidir
 * qué deliveries se envían en un solo mensaje agrupado.
 *
 * groupKey = `${publisherId}|${meetingWeekId}|${reminderType}`
 *
 * Deliveries hermanos (misma persona, misma semana, mismo tipo de recordatorio)
 * comparten scheduledAt idéntico, por lo que vencen en el mismo tick y llegan
 * juntos en el lote `due`. Se agrupan aquí y se envían como un único mensaje.
 */

export interface GroupableDelivery {
  publisherId: string;
  reminderType: string;
  assignment: { meetingWeekId: string };
}

/** Clave de agrupación por persona + semana + bucket de recordatorio. */
export function groupKey(d: GroupableDelivery): string {
  return `${d.publisherId}|${d.assignment.meetingWeekId}|${d.reminderType}`;
}

/**
 * Parte el lote en grupos preservando el orden de aparición del primer miembro
 * de cada grupo (estable). Cada grupo es la lista de deliveries hermanos.
 */
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
