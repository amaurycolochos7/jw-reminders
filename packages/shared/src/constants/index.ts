export const DEFAULT_TIMEZONE = "America/Mexico_City";
export const DEFAULT_REMINDER_SEND_HOUR = 9;
export const WORKER_POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const WHATSAPP_SEND_DELAY_MS = 3000; // 3 seconds between messages

export const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  BIBLE_READING: "Lectura de la Biblia",
  START_CONVERSATION: "Empiece conversaciones",
  MAKE_RETURN_VISIT: "Haga revisitas",
  BIBLE_STUDY: "Curso bíblico",
  EXPLAIN_BELIEFS: "Explique sus creencias",
  MAKE_DISCIPLES: "Haga discípulos",
  TALK: "Discurso",
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
