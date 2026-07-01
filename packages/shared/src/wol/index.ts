/**
 * Núcleo puro para la integración con WOL (wol.jw.org) — Vida y Ministerio.
 *
 * Sin efectos secundarios ni dependencias de red: sólo cálculo de semana/año
 * ISO, construcción de la URL de reuniones, la regla central
 * `requiresAssistant(title)` y el mapeo de un título de WOL al `AssignmentType`
 * que ya usa el sistema.
 *
 * Estas funciones son la fuente de verdad y deben ser fáciles de modificar.
 */

import type { AssignmentTypeId, SectionId } from "../assignment-rules/index.js";

// ─── Semana / año ISO ────────────────────────────────────

/**
 * Normaliza una fecha (Date o "YYYY-MM-DD") a un Date en UTC a medianoche.
 * Se trabaja en UTC para que el número de semana no dependa de la zona horaria.
 */
function toUtcDate(value: Date | string): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const datePart = value.split("T")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Número de semana ISO 8601 (1..53). La semana va de lunes a domingo y la
 * semana 1 es la que contiene el primer jueves del año.
 *
 * Ejemplo: 2026-06-29 (lunes) → 27.
 */
export function getIsoWeekNumber(date: Date | string): number {
  const d = toUtcDate(date);
  // getUTCDay: 0=domingo..6=sábado. ISO: lunes=1..domingo=7.
  const dayNum = (d.getUTCDay() + 6) % 7;
  // Jueves de esta semana ISO.
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays = Math.round((d.getTime() - isoYearStart.getTime()) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Año ISO 8601 que corresponde a la semana ISO de esta fecha. Puede diferir del
 * año natural en los bordes de diciembre/enero (p. ej. 2025-12-30 → año ISO 2026).
 */
export function getIsoWeekYear(date: Date | string): number {
  const d = toUtcDate(date);
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jueves de la semana ISO
  return d.getUTCFullYear();
}

/**
 * Lunes (inicio) de la semana ISO que contiene la fecha dada, como "YYYY-MM-DD".
 */
export function getIsoWeekStart(date: Date | string): string {
  const d = toUtcDate(date);
  const dayNum = (d.getUTCDay() + 6) % 7; // 0=lunes
  d.setUTCDate(d.getUTCDate() - dayNum);
  return isoDateString(d);
}

/**
 * Domingo (fin) de la semana ISO que contiene la fecha dada, como "YYYY-MM-DD".
 */
export function getIsoWeekEnd(date: Date | string): string {
  const start = toUtcDate(getIsoWeekStart(date));
  start.setUTCDate(start.getUTCDate() + 6);
  return isoDateString(start);
}

function isoDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── URL de WOL ──────────────────────────────────────────

export const WOL_MEETINGS_BASE = "https://wol.jw.org/es/wol/meetings/r4/lp-s";

/**
 * Construye la URL de la página de reuniones de WOL para el año y número de
 * semana ISO dados.
 *
 * Ejemplo: (2026, 27) → https://wol.jw.org/es/wol/meetings/r4/lp-s/2026/27
 */
export function buildWolMeetingsUrl(year: number, weekNumber: number): string {
  return `${WOL_MEETINGS_BASE}/${year}/${weekNumber}`;
}

export interface WolWeekCoordinates {
  year: number;
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  meetingsUrl: string;
}

/**
 * A partir de cualquier fecha dentro de la semana de la reunión, devuelve las
 * coordenadas WOL (año ISO, número de semana, lunes/domingo y URL de reuniones).
 *
 * Ejemplo: 2026-06-29 → { year: 2026, weekNumber: 27, weekStart: "2026-06-29",
 * weekEnd: "2026-07-05", meetingsUrl: ".../2026/27" }
 */
export function getWolWeekCoordinates(date: Date | string): WolWeekCoordinates {
  const year = getIsoWeekYear(date);
  const weekNumber = getIsoWeekNumber(date);
  return {
    year,
    weekNumber,
    weekStart: getIsoWeekStart(date),
    weekEnd: getIsoWeekEnd(date),
    meetingsUrl: buildWolMeetingsUrl(year, weekNumber),
  };
}

// ─── requiresAssistant (regla central por título) ────────

/** Normaliza un texto: minúsculas, sin tildes, espacios colapsados. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Títulos (o fragmentos) de partes que SÍ llevan acompañante. Fácil de ampliar.
 */
const REQUIRES_ASSISTANT_TITLES = [
  "empiece conversaciones",
  "haga revisitas",
  "haga discipulos",
  "explique sus creencias",
  "curso biblico",
  "revisita",
  "primera conversacion",
].map(normalizeTitle);

/**
 * Títulos que NO llevan acompañante. Tienen prioridad sobre la lista anterior.
 */
const NO_ASSISTANT_TITLES = [
  "lectura de la biblia",
  "discurso",
].map(normalizeTitle);

/**
 * ¿Esta parte necesita acompañante? Regla centralizada basada en el título de
 * la asignación tal como aparece en WOL.
 */
export function requiresAssistant(title: string): boolean {
  const n = normalizeTitle(title);
  if (NO_ASSISTANT_TITLES.some((t) => n.includes(t))) return false;
  if (REQUIRES_ASSISTANT_TITLES.some((t) => n.includes(t))) return true;
  return false;
}

// ─── Mapeo título WOL → AssignmentType existente ─────────

/**
 * Mapea el título de una parte de WOL al `AssignmentType` que ya usa el sistema.
 * Devuelve "OTHER" cuando no reconoce el título.
 */
export function mapWolTitleToType(title: string): AssignmentTypeId {
  const n = normalizeTitle(title);
  if (n.includes("lectura de la biblia")) return "BIBLE_READING";
  if (n.includes("empiece conversaciones") || n.includes("primera conversacion")) return "START_CONVERSATION";
  if (n.includes("haga revisitas") || n === "revisita" || n.includes("revisita")) return "MAKE_RETURN_VISIT";
  if (n.includes("curso biblico")) return "BIBLE_STUDY";
  if (n.includes("explique sus creencias")) return "EXPLAIN_BELIEFS";
  if (n.includes("haga discipulos")) return "MAKE_DISCIPLES";
  if (n.includes("discurso")) return "TALK";
  return "OTHER";
}

/** Sección (BIBLE_READING / APPLY_YOURSELF) derivada del título de WOL. */
export function mapWolTitleToSection(title: string): SectionId {
  return mapWolTitleToType(title) === "BIBLE_READING" ? "BIBLE_READING" : "APPLY_YOURSELF";
}
