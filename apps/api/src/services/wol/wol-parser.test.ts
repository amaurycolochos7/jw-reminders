import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getIsoWeekNumber,
  getIsoWeekYear,
  getIsoWeekStart,
  getIsoWeekEnd,
  buildWolMeetingsUrl,
  getWolWeekCoordinates,
  requiresAssistant,
  mapWolTitleToType,
} from "@jw-reminders/shared";
import { parseWolProgram } from "./wol-parser.js";

// ── Caso base del spec: semana 29 jun – 5 jul 2026 → 2026/27 ──
test("semana ISO y URL WOL para 2026-06-29", () => {
  assert.equal(getIsoWeekNumber("2026-06-29"), 27);
  assert.equal(getIsoWeekYear("2026-06-29"), 2026);
  assert.equal(getIsoWeekStart("2026-06-29"), "2026-06-29");
  assert.equal(getIsoWeekEnd("2026-06-29"), "2026-07-05");
  assert.equal(
    buildWolMeetingsUrl(2026, 27),
    "https://wol.jw.org/es/wol/meetings/r4/lp-s/2026/27",
  );
  const coords = getWolWeekCoordinates("2026-07-02"); // jueves de esa semana
  assert.equal(coords.year, 2026);
  assert.equal(coords.weekNumber, 27);
  assert.equal(coords.weekStart, "2026-06-29");
  assert.equal(coords.weekEnd, "2026-07-05");
  assert.equal(coords.meetingsUrl, "https://wol.jw.org/es/wol/meetings/r4/lp-s/2026/27");
});

test("semana ISO en bordes de año", () => {
  // 2025-12-30 (martes) pertenece a la semana ISO 1 de 2026.
  assert.equal(getIsoWeekYear("2025-12-30"), 2026);
  assert.equal(getIsoWeekNumber("2025-12-30"), 1);
});

// ── requiresAssistant ──
test("requiresAssistant sigue las reglas del spec", () => {
  assert.equal(requiresAssistant("Empiece conversaciones"), true);
  assert.equal(requiresAssistant("Haga revisitas"), true);
  assert.equal(requiresAssistant("Haga discípulos"), true);
  assert.equal(requiresAssistant("Explique sus creencias"), true);
  assert.equal(requiresAssistant("Curso bíblico"), true);
  assert.equal(requiresAssistant("Lectura de la Biblia"), false);
  assert.equal(requiresAssistant("Discurso"), false);
});

test("mapWolTitleToType mapea a los tipos existentes", () => {
  assert.equal(mapWolTitleToType("Lectura de la Biblia"), "BIBLE_READING");
  assert.equal(mapWolTitleToType("Empiece conversaciones"), "START_CONVERSATION");
  assert.equal(mapWolTitleToType("Haga revisitas"), "MAKE_RETURN_VISIT");
  assert.equal(mapWolTitleToType("Discurso"), "TALK");
});

// ── Parser: caso base del spec ──
const SAMPLE = `
Lectura de la Biblia
(4 mins.) Jer 12:1-11 (th lección 2).

4. Empiece conversaciones
(3 mins.) PREDICACIÓN INFORMAL. Empiece una conversación después de que alguien haga o diga algo amable (lmd lección 1 punto 4).

5. Haga revisitas
(4 mins.) DE CASA EN CASA. La persona tiene hijos (lmd lección 3 punto 3).

6. Discurso
(5 mins.) lmd apéndice A punto 17. Título: Jesús fue un gran maestro y sus consejos siempre funcionan (th lección 14).
`;

test("parseWolProgram extrae las 4 partes del caso base", () => {
  const { items } = parseWolProgram(SAMPLE, "https://wol.jw.org/es/wol/d/r4/lp-s/202026169");
  assert.equal(items.length, 4);

  const [lectura, empiece, revisitas, discurso] = items;

  // Item 1: Lectura de la Biblia
  assert.equal(lectura.title, "Lectura de la Biblia");
  assert.equal(lectura.itemNumber, null);
  assert.equal(lectura.durationMinutes, 4);
  assert.equal(lectura.description, "Jer 12:1-11");
  assert.equal(lectura.lesson, "th lección 2");
  assert.equal(lectura.requiresAssistant, false);
  assert.equal(lectura.context, null);
  assert.equal(lectura.reference, null);

  // Item 2: Empiece conversaciones
  assert.equal(empiece.itemNumber, 4);
  assert.equal(empiece.title, "Empiece conversaciones");
  assert.equal(empiece.durationMinutes, 3);
  assert.equal(empiece.context, "PREDICACIÓN INFORMAL");
  assert.equal(empiece.description, "Empiece una conversación después de que alguien haga o diga algo amable");
  assert.equal(empiece.reference, "lmd lección 1 punto 4");
  assert.equal(empiece.requiresAssistant, true);

  // Item 3: Haga revisitas
  assert.equal(revisitas.itemNumber, 5);
  assert.equal(revisitas.title, "Haga revisitas");
  assert.equal(revisitas.durationMinutes, 4);
  assert.equal(revisitas.context, "DE CASA EN CASA");
  assert.equal(revisitas.description, "La persona tiene hijos");
  assert.equal(revisitas.reference, "lmd lección 3 punto 3");
  assert.equal(revisitas.requiresAssistant, true);

  // Item 4: Discurso
  assert.equal(discurso.itemNumber, 6);
  assert.equal(discurso.title, "Discurso");
  assert.equal(discurso.durationMinutes, 5);
  assert.equal(discurso.reference, "lmd apéndice A punto 17");
  assert.equal(discurso.description, "Título: Jesús fue un gran maestro y sus consejos siempre funcionan");
  assert.equal(discurso.lesson, "th lección 14");
  assert.equal(discurso.requiresAssistant, false);
});

test("parseWolProgram no inventa datos con texto vacío o desconocido", () => {
  assert.equal(parseWolProgram("").items.length, 0);
  assert.equal(parseWolProgram("Cántico 88 y oración\nPalabras de introducción (1 min.)").items.length, 0);
});

test("parseWolProgram asigna sortOrder único aunque se repitan títulos", () => {
  const dup = `
Empiece conversaciones
(3 mins.) PREDICACIÓN INFORMAL. Primera idea (lmd lección 1 punto 1).

Empiece conversaciones
(2 mins.) PREDICACIÓN INFORMAL. Segunda idea (lmd lección 1 punto 2).
`;
  const { items } = parseWolProgram(dup);
  assert.equal(items.length, 2);
  // Mismo título, pero sortOrder distinto: la llave (weekId, sortOrder) no colisiona.
  assert.equal(items[0].title, items[1].title);
  assert.notEqual(items[0].sortOrder, items[1].sortOrder);
});

/**
 * Simula el upsert por (meetingWeekId, sortOrder) para demostrar que reimportar
 * la misma semana NO duplica items y que actualiza en su lugar.
 */
test("upsert por (weekId, sortOrder) no duplica al reimportar", () => {
  const weekId = "week-1";
  const store = new Map<string, any>();
  const upsert = (items: ReturnType<typeof parseWolProgram>["items"]) => {
    for (const item of items) {
      store.set(`${weekId}|${item.sortOrder}`, { ...item });
    }
  };

  const first = parseWolProgram(SAMPLE);
  upsert(first.items);
  assert.equal(store.size, 4);

  // Reimportar el mismo contenido: sigue habiendo 4 (no se duplica).
  upsert(parseWolProgram(SAMPLE).items);
  assert.equal(store.size, 4);

  // Reimportar con títulos repetidos entre sí tampoco rompe la llave.
  const dup = parseWolProgram(`
Empiece conversaciones
(3 mins.) PREDICACIÓN INFORMAL. Idea A (lmd lección 1 punto 1).

Empiece conversaciones
(2 mins.) PREDICACIÓN INFORMAL. Idea B (lmd lección 1 punto 2).
`);
  const store2 = new Map<string, any>();
  for (const item of dup.items) store2.set(`w|${item.sortOrder}`, item);
  assert.equal(store2.size, 2);
});
