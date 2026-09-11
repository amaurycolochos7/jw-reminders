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

test("mapWolTitleToType: 'curso bíblico' solo cuenta como título propio (anclado)", () => {
  // Título real de la parte → sí clasifica como curso bíblico.
  assert.equal(mapWolTitleToType("Curso bíblico"), "BIBLE_STUDY");
  // Instrucción del auditorio que menciona 'curso bíblico' al final → NO es una
  // asignación de curso bíblico (antes generaba un item basura sin duración).
  assert.equal(
    mapWolTitleToType("Haga una lista de personas a las que le gustaría ofrecerles un curso bíblico"),
    "OTHER",
  );
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

test("parseWolProgram emite las secciones de reunión sin arrastrar footer (texto real de WOL)", () => {
  const noisy = `
TESOROS DE LA BIBLIA
1. Cómo competir en una carrera contra caballos (10 mins.)
2. Busquemos perlas escondidas (10 mins.) Jer 12:5.
3. Lectura de la Biblia
(4 mins.) Jer 12:1-11 (th lección 2).
SEAMOS MEJORES MAESTROS
4. Empiece conversaciones
(3 mins.) PREDICACIÓN INFORMAL. Empiece una conversación después de que alguien haga o diga algo amable (lmd lección 1 punto 4).
5. Haga revisitas
(4 mins.) DE CASA EN CASA. La persona tiene hijos (lmd lección 3 punto 3).
6. Discurso
(5 mins.) lmd apéndice A punto 17. Título: Jesús fue un gran maestro y sus consejos siempre funcionan (th lección 14).
NUESTRA VIDA CRISTIANA
Canción 109
7. Necesidades de la congregación (15 mins.)
8. Estudio bíblico de la congregación (30 mins.) lfb lecciones 98, 99.
Palabras de conclusión (3 mins.) | Canción 69 y oración
Copyright © 2026 Watch Tower
`;
  const { items } = parseWolProgram(noisy);
  // Total real ahora: Tesoros(1) + Perlas(1) + Lectura + Empiece + Revisitas +
  // Discurso + Canción109 + Necesidades(NVC) + EBC + Conclusión + Canción69 = 11
  assert.equal(items.length, 11);

  const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));

  // (i) El cuerpo de los items SMM NO arrastra footer/copyright/jw.org.
  assert.equal(byTitle["Lectura de la Biblia"].description, "Jer 12:1-11");
  assert.equal(byTitle["Lectura de la Biblia"].itemNumber, 3);
  assert.equal(byTitle["Discurso"].description, "Título: Jesús fue un gran maestro y sus consejos siempre funcionan");
  assert.equal(byTitle["Discurso"].reference, "lmd apéndice A punto 17");
  assert.equal(byTitle["Discurso"].lesson, "th lección 14");
  assert.equal(byTitle["Empiece conversaciones"].context, "PREDICACIÓN INFORMAL");
  // Ningún item debe contener texto de copyright/footer.
  assert.ok(items.every((i) => !/(copyright|watch tower|jw\.org)/i.test(i.description ?? "")));
  assert.ok(items.every((i) => !/(copyright|watch tower|jw\.org)/i.test(i.title)));

  // (ii) Las NUEVAS partes se emiten con su tipo correcto.
  const tesoros = byTitle["Cómo competir en una carrera contra caballos"];
  assert.ok(tesoros, "Tesoros de la Biblia (punto 1, título variable) debe emitirse");
  assert.equal(tesoros.assignmentType, "TREASURES_TALK");
  assert.equal(tesoros.durationMinutes, 10);
  assert.equal(tesoros.section, "TREASURES");

  assert.equal(byTitle["Busquemos perlas escondidas"].assignmentType, "SPIRITUAL_GEMS");
  assert.equal(byTitle["Necesidades de la congregación"].assignmentType, "CHRISTIAN_LIVING");
  assert.equal(byTitle["Estudio bíblico de la congregación"].assignmentType, "CONGREGATION_BIBLE_STUDY_CONDUCTOR");
  assert.equal(byTitle["Estudio bíblico de la congregación"].durationMinutes, 30);
  assert.equal(byTitle["Palabras de conclusión"].assignmentType, "CONCLUDING_COMMENTS");
  assert.equal(byTitle["Palabras de conclusión"].durationMinutes, 3);

  // Las canciones se emiten como SONG informativo (requiresAssignee=false).
  const songs = items.filter((i) => i.assignmentType === "SONG");
  assert.equal(songs.length, 2);
  assert.ok(songs.every((s) => s.requiresAssignee === false));
});

test("una parte de estudiante impartida como Discurso no rompe el parseo", () => {
  const sample = `
3. Lectura de la Biblia
(4 mins.) Jer 19:1-11 (th lección 5).
4. Empiece conversaciones
(4 mins.) Ofrézcale a la persona un curso de la Biblia (lmd lección 8 punto 3).
5. Haga revisitas
(4 mins.) Siga analizando con la persona el tratado (lmd lección 9 punto 3).
6. Explique sus creencias
(4 mins.) Discurso. ijwbq artículo 44. Título: ¿Qué dice la Biblia sobre el libre albedrío? (th lección 20).
`;
  const { items } = parseWolProgram(sample)
  assert.equal(items.length, 4)
  const byTitle = Object.fromEntries(items.map((i) => [i.title, i]))
  const explique = byTitle['Explique sus creencias']
  assert.ok(explique, 'debe existir el item Explique sus creencias')
  assert.equal(explique.durationMinutes, 4)
  assert.equal(explique.requiresAssistant, true)
  assert.ok(explique.description && explique.description.includes('libre albedrío'))
  assert.equal(explique.lesson, 'th lección 20')
  // No debe haber items basura sin título reconocible.
  assert.ok(items.every((i) => i.title && i.durationMinutes != null))
})

test("parseWolProgram: texto vacío no inventa datos; cántico e introducción sí se emiten", () => {
  // Texto vacío → sin items (no inventa nada).
  assert.equal(parseWolProgram("").items.length, 0);

  // Ahora "Cántico 88..." emite un SONG informativo y "Palabras de introducción"
  // un OPENING_COMMENTS. Antes se descartaban.
  const { items } = parseWolProgram("Cántico 88 y oración\nPalabras de introducción (1 min.)");
  assert.equal(items.length, 2);
  const [cancion, intro] = items;
  assert.equal(cancion.assignmentType, "SONG");
  assert.equal(cancion.requiresAssignee, false);
  assert.equal(intro.assignmentType, "OPENING_COMMENTS");
  assert.equal(intro.durationMinutes, 1);
  assert.notEqual(intro.requiresAssignee, false); // asignable (queda true)
});

// ── Fase 3: nuevas partes de la reunión ──

test("REGRESIÓN SMM: el caso base sigue dando exactamente las mismas 4 partes", () => {
  const { items } = parseWolProgram(SAMPLE);
  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((i) => [i.title, i.assignmentType, i.durationMinutes]),
    [
      ["Lectura de la Biblia", "BIBLE_READING", 4],
      ["Empiece conversaciones", "START_CONVERSATION", 3],
      ["Haga revisitas", "MAKE_RETURN_VISIT", 4],
      ["Discurso", "TALK", 5],
    ],
  );
  // Ninguna parte SMM se marca informativa.
  assert.ok(items.every((i) => i.requiresAssignee !== false));
});

test("AUDIENCE_ANALYSIS: parte nueva de SMM '¿Qué diría?' (Análisis con el auditorio)", () => {
  const smm = `
SEAMOS MEJORES MAESTROS
4. Empiece conversaciones (3 mins.) DE CASA EN CASA. lmd lección 1.
5. Haga revisitas (4 mins.) DE CASA EN CASA. lmd lección 3.
6. ¿Qué diría? (6 mins.) Análisis con el auditorio. DE CASA EN CASA. Repase brevemente Una obra de amor lección 2 punto 5.
`;
  const { items } = parseWolProgram(smm);
  const analisis = items.find((i) => i.assignmentType === "AUDIENCE_ANALYSIS");
  assert.ok(analisis, "debe emitir la parte de análisis con el auditorio");
  assert.equal(analisis!.itemNumber, 6);
  assert.equal(analisis!.title, "¿Qué diría?");
  assert.equal(analisis!.durationMinutes, 6);
  assert.equal(analisis!.section, "APPLY_YOURSELF");
  assert.equal(analisis!.requiresAssistant, false); // la dirige un solo hermano
  // Las partes de estudiante previas se conservan intactas.
  assert.equal(items.filter((i) => i.assignmentType === "START_CONVERSATION").length, 1);
  assert.equal(items.filter((i) => i.assignmentType === "MAKE_RETURN_VISIT").length, 1);
});

test("FALSO POSITIVO: instrucción con 'curso bíblico' sin duración NO genera asignación", () => {
  const smm = `
SEAMOS MEJORES MAESTROS
6. Haga revisitas (5 mins.) DE CASA EN CASA. lmd lección 3.
Haga una lista de personas a las que le gustaría ofrecerles un curso bíblico.
Respuesta
`;
  const { items } = parseWolProgram(smm);
  // Antes esta línea instructiva se emitía como BIBLE_STUDY con duración nula
  // (rompía la semana). Ahora no debe existir ninguna asignación así.
  assert.equal(items.filter((i) => i.assignmentType === "BIBLE_STUDY").length, 0);
  assert.ok(items.every((i) => i.durationMinutes !== null), "ningún item queda sin duración");
});

test("Guía desde noviembre 2026: los títulos en forma 'nosotros' siguen siendo las mismas partes", () => {
  // Texto real de la semana 2026-11-02. Antes, "Empecemos conversaciones" y
  // "Hagamos discípulos" no coincidían con ningún título conocido y las partes
  // 4 y 6 desaparecían del programa SIN ninguna advertencia.
  const { items, warnings } = parseWolProgram(`
SEAMOS MEJORES MAESTROS
4. Empecemos conversaciones (3 mins.) DE CASA EN CASA. Enseña una verdad bíblica ( lmd lección 1 punto 5 ).
5. Hagamos revisitas (4 mins.) DE CASA EN CASA. Visitas a alguien para conversar ( lmd lección 9 punto 3 ).
6. Hagamos discípulos (5 mins.) lff lección 20 punto 4 ( lmd lección 11 punto 4 ).
`);
  assert.deepEqual(
    items.map((i) => [i.itemNumber, i.assignmentType]),
    [
      [4, "START_CONVERSATION"],
      [5, "MAKE_RETURN_VISIT"],
      [6, "MAKE_DISCIPLES"],
    ],
  );
  assert.deepEqual(warnings, []);
  // Son partes de estudiante: llevan acompañante igual que su forma antigua.
  assert.ok(items.every((i) => i.requiresAssistant));
});

test("HUECO: una parte numerada que no se reconoce avisa en vez de desaparecer", () => {
  const { items, warnings } = parseWolProgram(`
SEAMOS MEJORES MAESTROS
4. Empiece conversaciones (3 mins.) DE CASA EN CASA. lmd lección 1.
5. Título totalmente nuevo que el parser no conoce (4 mins.) DE CASA EN CASA.
`);
  // La parte 5 no se pierde en silencio: la semana queda marcada para revisión.
  assert.equal(items.some((i) => i.itemNumber === 5), false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /parte 5 del programa/);
});

test("FALSO POSITIVO: una frase del cuerpo que menciona 'discurso' NO es una parte", () => {
  // Texto real de la semana 2026-03-23: viñeta dentro de una parte de NVC.
  const { items, warnings } = parseWolProgram(`
NUESTRA VIDA CRISTIANA
7. Aproveche bien el día más importante del año (15 mins.) Análisis con el auditorio.
Participe al máximo en la campaña invitando a conocidos, familiares y personas del territorio a asistir al discurso especial y a la Conmemoración.
`);
  assert.equal(items.length, 1);
  assert.equal(items[0].assignmentType, "CHRISTIAN_LIVING");
  assert.equal(items.filter((i) => i.assignmentType === "TALK").length, 0);
  assert.ok(items.every((i) => i.durationMinutes !== null));
  assert.deepEqual(warnings, []);
});

test("Semana sin reunión normal (solo cánticos) se marca para revisión", () => {
  const { items, warnings } = parseWolProgram(`
CANCIÓN 76 Cuéntame lo que sientes
CANCIÓN 160 ¡Buenas noticias!
`);
  assert.equal(items.length, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ninguna parte asignable/);
});

test("TREASURES_TALK: captura el título variable del punto 1 (10 min)", () => {
  const { items } = parseWolProgram(`
TESOROS DE LA BIBLIA
1. Cómo competir en una carrera contra caballos (10 mins.) Analice Jer 12:5.
`);
  assert.equal(items.length, 1);
  const [tesoros] = items;
  assert.equal(tesoros.title, "Cómo competir en una carrera contra caballos");
  assert.equal(tesoros.assignmentType, "TREASURES_TALK");
  assert.equal(tesoros.section, "TREASURES");
  assert.equal(tesoros.durationMinutes, 10);
  assert.equal(tesoros.itemNumber, 1);
  assert.notEqual(tesoros.requiresAssignee, false);
});

test("SPIRITUAL_GEMS: se reconoce por su título fijo (10 min)", () => {
  const { items } = parseWolProgram(`
TESOROS DE LA BIBLIA
2. Busquemos perlas escondidas (10 mins.) Jer 12:5.
`);
  assert.equal(items.length, 1);
  assert.equal(items[0].assignmentType, "SPIRITUAL_GEMS");
  assert.equal(items[0].section, "TREASURES");
  assert.equal(items[0].durationMinutes, 10);
});

test("CONCLUDING_COMMENTS: palabras de conclusión (3 min)", () => {
  const { items } = parseWolProgram("Palabras de conclusión (3 mins.)");
  assert.equal(items.length, 1);
  assert.equal(items[0].assignmentType, "CONCLUDING_COMMENTS");
  assert.equal(items[0].section, "CONCLUSION");
  assert.equal(items[0].durationMinutes, 3);
});

test("CONGREGATION_BIBLE_STUDY_CONDUCTOR: estudio bíblico de la congregación (30 min)", () => {
  const { items } = parseWolProgram(`
NUESTRA VIDA CRISTIANA
8. Estudio bíblico de la congregación (30 mins.) lfb lecciones 98, 99.
`);
  assert.equal(items.length, 1);
  assert.equal(items[0].assignmentType, "CONGREGATION_BIBLE_STUDY_CONDUCTOR");
  assert.equal(items[0].section, "LIVING_AS_CHRISTIANS");
  assert.equal(items[0].durationMinutes, 30);
});

test("NVC dinámica: una sola parte de Nuestra Vida Cristiana", () => {
  const { items } = parseWolProgram(`
NUESTRA VIDA CRISTIANA
7. Necesidades de la congregación (15 mins.)
`);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Necesidades de la congregación");
  assert.equal(items[0].assignmentType, "CHRISTIAN_LIVING");
  assert.equal(items[0].section, "LIVING_AS_CHRISTIANS");
  assert.equal(items[0].durationMinutes, 15);
});

test("NVC dinámica: 2+ partes con títulos variables, cada una un item independiente", () => {
  const { items } = parseWolProgram(`
NUESTRA VIDA CRISTIANA
7. Necesidades de la congregación (15 mins.)
8. Seamos ejemplo en el amor (5 mins.) Análisis con el auditorio.
9. Estudio bíblico de la congregación (30 mins.) lfb lección 1.
`);
  assert.equal(items.length, 3);
  const nvc = items.filter((i) => i.assignmentType === "CHRISTIAN_LIVING");
  assert.equal(nvc.length, 2);
  assert.deepEqual(nvc.map((i) => i.title), [
    "Necesidades de la congregación",
    "Seamos ejemplo en el amor",
  ]);
  // El EBC final se reconoce por su título fijo, no como CHRISTIAN_LIVING.
  assert.equal(items[2].assignmentType, "CONGREGATION_BIBLE_STUDY_CONDUCTOR");
  // sortOrder único e incremental.
  assert.deepEqual(items.map((i) => i.sortOrder), [0, 1, 2]);
});

test("SONG: se emite como informativo (requiresAssignee=false) capturando el título", () => {
  const { items } = parseWolProgram("Canción 109");
  assert.equal(items.length, 1);
  assert.equal(items[0].assignmentType, "SONG");
  assert.equal(items[0].title, "Canción 109");
  assert.equal(items[0].requiresAssignee, false);
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
