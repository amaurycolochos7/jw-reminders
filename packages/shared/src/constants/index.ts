export const DEFAULT_TIMEZONE = "America/Mexico_City";
export const DEFAULT_REMINDER_SEND_HOUR = 9;
export const WORKER_POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const WHATSAPP_SEND_DELAY_MS = 3000; // 3 seconds between messages (legacy fallback)

// ── Anti-baneo (inspirado en el sistema cedgym) ──────────────────────────────
// En lugar de una pausa fija, se espera un tiempo ALEATORIO entre cada envío
// (jitter) para que el patrón no parezca robótico. Además, cada ejecución del
// worker (tick) tiene un TOPE de mensajes: si al generar una semana completa se
// programan muchos avisos iniciales a la vez, no se mandan todos de golpe; el
// resto queda pendiente y se envía en los siguientes ticks (cada 10 min).
export const WHATSAPP_SEND_DELAY_MIN_MS = 28000; // ~28s mínimo (scrapper usa 35s base)
export const WHATSAPP_SEND_DELAY_MAX_MS = 42000; // ~42s máximo (35s + 20% jitter)
export const WORKER_MAX_SENDS_PER_RUN = 50; // procesar todos los pendientes en un tick (con delays internos)

/**
 * Devuelve una pausa aleatoria (ms) dentro del rango [min, max]. Si el rango es
 * inválido se cae al valor fijo legacy (WHATSAPP_SEND_DELAY_MS).
 */
export function randomSendDelayMs(
  minMs: number = WHATSAPP_SEND_DELAY_MIN_MS,
  maxMs: number = WHATSAPP_SEND_DELAY_MAX_MS,
): number {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs < minMs || minMs < 0) {
    return WHATSAPP_SEND_DELAY_MS;
  }
  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

export const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  BIBLE_READING: "Lectura de la Biblia",
  START_CONVERSATION: "Empiece conversaciones",
  MAKE_RETURN_VISIT: "Haga revisitas",
  BIBLE_STUDY: "Curso bíblico",
  EXPLAIN_BELIEFS: "Explique sus creencias",
  MAKE_DISCIPLES: "Haga discípulos",
  TALK: "Discurso",
  AUDIENCE_ANALYSIS: "Análisis con el auditorio",
  OTHER: "Otra asignación",
  // Fase 3: resto de la reunión.
  CHAIRMAN: "Presidente",
  OPENING_COMMENTS: "Palabras de introducción",
  OPENING_PRAYER: "Oración inicial",
  TREASURES_TALK: "Tesoros de la Biblia",
  SPIRITUAL_GEMS: "Busquemos perlas escondidas",
  CHRISTIAN_LIVING: "Nuestra Vida Cristiana",
  CONGREGATION_BIBLE_STUDY_CONDUCTOR: "Estudio Bíblico de la Congregación (conductor)",
  CONGREGATION_BIBLE_STUDY_READER: "Estudio Bíblico de la Congregación (lector)",
  CONCLUDING_COMMENTS: "Palabras de conclusión",
  CLOSING_PRAYER: "Oración final",
  SONG: "Canción",
};

export const ROOM_LABELS: Record<string, string> = {
  MAIN: "Sala principal",
  AUXILIARY: "Sala auxiliar",
};

export const REMINDER_TYPE_LABELS: Record<string, string> = {
  INITIAL_NOTICE: "Aviso inicial",
  SEVEN_DAYS_BEFORE: "7 días antes",
  THREE_DAYS_BEFORE: "3 días antes",
  ONE_DAY_BEFORE: "1 día antes",
  SAME_DAY: "Mismo día",
  CHANGE_NOTICE: "Cambio de asignación",
  CANCELLATION_NOTICE: "Cancelación",
};
