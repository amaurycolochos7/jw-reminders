/**
 * Reglas puras para las acciones sobre entregas de recordatorio (ReminderDelivery).
 *
 * Fuente de verdad compartida por:
 *  - la API (endpoints editar mensaje / enviar ahora / reprogramar),
 *  - el worker (prioridad de mensaje personalizado sobre plantilla),
 *  - las pruebas deterministas.
 *
 * No tiene dependencias de Prisma ni de red: solo lógica.
 */

export type ReminderStatusValue =
  | "PENDING"
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED"
  | "DEAD";

/** Estados en los que se puede editar el mensaje personalizado. */
export const EDITABLE_MESSAGE_STATES: ReminderStatusValue[] = ["PENDING", "FAILED"];
/** Estados en los que se puede "enviar ahora". */
export const SEND_NOW_STATES: ReminderStatusValue[] = ["PENDING", "FAILED"];
/** Estados en los que se puede reprogramar. */
export const RESCHEDULE_STATES: ReminderStatusValue[] = ["PENDING", "FAILED"];

export function canEditMessage(status: string): boolean {
  return EDITABLE_MESSAGE_STATES.includes(status as ReminderStatusValue);
}

export function canSendNow(status: string): boolean {
  return SEND_NOW_STATES.includes(status as ReminderStatusValue);
}

export function canReschedule(status: string): boolean {
  return RESCHEDULE_STATES.includes(status as ReminderStatusValue);
}

/**
 * Prioridad de mensaje de salida:
 *  1. Si hay customMessage con contenido no vacío, se usa ese.
 *  2. Si no, se usa el texto renderizado desde la plantilla.
 */
export function resolveOutboundMessage(
  customMessage: string | null | undefined,
  templateMessage: string,
): string {
  if (typeof customMessage === "string" && customMessage.trim().length > 0) {
    return customMessage;
  }
  return templateMessage;
}

/** ¿La entrega lleva mensaje personalizado activo? */
export function hasCustomMessage(customMessage: string | null | undefined): boolean {
  return typeof customMessage === "string" && customMessage.trim().length > 0;
}

/**
 * Metadatos de auditoría para una edición de mensaje.
 * NO incluye el texto del mensaje (puede contener datos personales).
 */
export function messageEditAuditMetadata(input: {
  previousStatus: string;
  hadCustomMessageBefore: boolean;
  hasCustomMessageAfter: boolean;
  actorId?: string | null;
}): Record<string, unknown> {
  return {
    previousStatus: input.previousStatus,
    hadCustomMessageBefore: input.hadCustomMessageBefore,
    hasCustomMessageAfter: input.hasCustomMessageAfter,
    actorId: input.actorId ?? null,
  };
}
