/**
 * Clasificación de notificaciones para deduplicar sin bloquear recordatorios.
 * Fuente de verdad compartida por el API y el worker.
 *
 * - FIRST_ASSIGNMENT (primer aviso) se envía UNA sola vez por (asignación,
 *   persona): su clave es siempre "FIRST_ASSIGNMENT".
 * - Los recordatorios comparten notificationType REMINDER pero tienen una clave
 *   distinta por tipo (REMINDER_7_DAYS, REMINDER_3_DAYS, ...), de modo que el
 *   unique [assignmentId, recipientPersonId, notificationKey] permite varios
 *   recordatorios pero impide repetir el mismo.
 */

export type NotificationTypeValue = "FIRST_ASSIGNMENT" | "REMINDER";

/** Tipos de recordatorio del sistema (ReminderType de Prisma). */
export type ReminderTypeValue =
  | "INITIAL_NOTICE"
  | "SEVEN_DAYS_BEFORE"
  | "THREE_DAYS_BEFORE"
  | "ONE_DAY_BEFORE"
  | "SAME_DAY"
  | "CHANGE_NOTICE"
  | "CANCELLATION_NOTICE";

export interface NotificationClassification {
  type: NotificationTypeValue;
  key: string;
}

const REMINDER_KEYS: Record<ReminderTypeValue, string> = {
  INITIAL_NOTICE: "FIRST_ASSIGNMENT",
  SEVEN_DAYS_BEFORE: "REMINDER_7_DAYS",
  THREE_DAYS_BEFORE: "REMINDER_3_DAYS",
  ONE_DAY_BEFORE: "REMINDER_1_DAY",
  SAME_DAY: "REMINDER_SAME_DAY",
  CHANGE_NOTICE: "CHANGE_NOTICE",
  CANCELLATION_NOTICE: "CANCELLATION_NOTICE",
};

/**
 * Clasifica un envío a partir de su ReminderType en { type, key }.
 * El primer aviso (INITIAL_NOTICE) es FIRST_ASSIGNMENT; el resto son REMINDER
 * con una clave única por tipo.
 */
export function classifyNotification(reminderType: string): NotificationClassification {
  const key = REMINDER_KEYS[reminderType as ReminderTypeValue] ?? `REMINDER_${reminderType}`;
  const type: NotificationTypeValue = reminderType === "INITIAL_NOTICE" ? "FIRST_ASSIGNMENT" : "REMINDER";
  return { type, key };
}
