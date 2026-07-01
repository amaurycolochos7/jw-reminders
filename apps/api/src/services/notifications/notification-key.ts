/**
 * Re-exporta la clasificación de notificaciones desde el paquete compartido,
 * fuente de verdad usada también por el worker.
 */
export {
  classifyNotification,
  type NotificationClassification,
  type NotificationTypeValue,
  type ReminderTypeValue,
} from "@jw-reminders/shared";
