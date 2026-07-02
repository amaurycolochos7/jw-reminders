import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupedPersonMessage,
  buildMonthlyInitialMessage,
  renderPartLines,
  formatMeetingTime,
  BLESSING_LINE,
  type MessagePart,
} from "@jw-reminders/shared";

// ─── Utilidades de aserción de formato ───────────────────────────────────────

/** Comprueba que el Markdown de negritas es correcto en todo el mensaje. */
function assertMarkdownOk(msg: string) {
  // Nunca un asterisco pegado a ":" (p. ej. "Punto:*Tesoros*").
  assert.ok(!/:\*/.test(msg), `Asterisco pegado a dos puntos en:\n${msg}`);
  // Nunca un espacio justo antes del asterisco de cierre (p. ej. "Tesoros *").
  assert.ok(!/ \*(\n|$)/.test(msg), `Espacio antes del asterisco de cierre en:\n${msg}`);
  // Número par de asteriscos (negritas bien cerradas).
  const count = (msg.match(/\*/g) || []).length;
  assert.equal(count % 2, 0, `Asteriscos desbalanceados en:\n${msg}`);
  // Sin "**" (doble asterisco vacío).
  assert.ok(!/\*\*/.test(msg), `Doble asterisco en:\n${msg}`);
}

/** Nunca deben existir tres saltos de línea seguidos (líneas vacías dobles). */
function assertNoEmptyGaps(msg: string) {
  assert.ok(!/\n\n\n/.test(msg), `Líneas vacías innecesarias en:\n${msg}`);
}

// Partes de referencia por tipo (números de punto según programa WOL típico).
const TESOROS: MessagePart = {
  sortOrder: 3, pointNumber: 1, sectionLabel: "Tesoros de la Biblia",
  title: "Predique con valor", durationMinutes: 10,
};
const PERLAS: MessagePart = {
  sortOrder: 4, pointNumber: 2, sectionLabel: "Busquemos perlas escondidas",
  title: "Busquemos perlas escondidas", durationMinutes: 10,
};
const LECTURA: MessagePart = {
  sortOrder: 5, pointNumber: 3, sectionLabel: "Lectura de la Biblia",
  title: "Lectura de la Biblia", durationMinutes: 4,
};
const PRESIDENTE: MessagePart = {
  sortOrder: -100, pointNumber: null, sectionLabel: "Presidente",
  title: "Presidente de la reunión", durationMinutes: 0,
};
const CONCLUSION: MessagePart = {
  sortOrder: 9000, pointNumber: null, sectionLabel: "Palabras de conclusión",
  title: "Palabras de conclusión", durationMinutes: 3,
};
const NVC: MessagePart = {
  sortOrder: 7, pointNumber: 7, sectionLabel: "Nuestra Vida Cristiana",
  title: "Logremos la unidad", durationMinutes: 15,
};
const EBC_COND: MessagePart = {
  sortOrder: 8, pointNumber: 8, sectionLabel: "Estudio Bíblico de la Congregación (conductor)",
  title: "Estudio bíblico de la congregación", durationMinutes: 30,
};
const EBC_LECTOR: MessagePart = {
  sortOrder: 9, pointNumber: 8, sectionLabel: "Estudio Bíblico de la Congregación (lector)",
  title: "Lector del estudio bíblico de la congregación", durationMinutes: 0,
};
const SMM_ESTUDIANTE: MessagePart = {
  sortOrder: 6, pointNumber: 4, sectionLabel: "Empiece conversaciones",
  title: "Empiece conversaciones", durationMinutes: 4,
  isApplyYourself: true, recipientRole: "ASSIGNED", companionName: "Patricia López",
};
const SMM_AYUDANTE: MessagePart = {
  sortOrder: 6, pointNumber: 5, sectionLabel: "Haga revisitas",
  title: "Haga revisitas", durationMinutes: 5,
  isApplyYourself: true, recipientRole: "COMPANION", assignedName: "Daniela Ruiz",
};

// ─── renderPartLines: información completa por tipo ───────────────────────────

test("Tesoros: número, sección en negrita, título real y duración", () => {
  assert.deepEqual(renderPartLines(TESOROS), [
    "• Punto 1",
    "*Tesoros de la Biblia*",
    "Predique con valor",
    "10 minutos",
  ]);
});

test("Perlas escondidas: no duplica el título cuando coincide con la sección", () => {
  assert.deepEqual(renderPartLines(PERLAS), [
    "• Punto 2",
    "*Busquemos perlas escondidas*",
    "10 minutos",
  ]);
});

test("Lectura de la Biblia: número, sección y duración; sin título repetido", () => {
  assert.deepEqual(renderPartLines(LECTURA), [
    "• Punto 3",
    "*Lectura de la Biblia*",
    "4 minutos",
  ]);
});

test("Presidente: sin número de punto y sin duración (0 min no se imprime)", () => {
  assert.deepEqual(renderPartLines(PRESIDENTE), [
    "• *Presidente*",
    "Presidente de la reunión",
  ]);
});

test("Palabras de conclusión: sin número, con duración", () => {
  assert.deepEqual(renderPartLines(CONCLUSION), [
    "• *Palabras de conclusión*",
    "3 minutos",
  ]);
});

test("Nuestra Vida Cristiana: número, sección, título y duración", () => {
  assert.deepEqual(renderPartLines(NVC), [
    "• Punto 7",
    "*Nuestra Vida Cristiana*",
    "Logremos la unidad",
    "15 minutos",
  ]);
});

test("Estudio Bíblico (conductor): no repite el título redundante con la sección", () => {
  assert.deepEqual(renderPartLines(EBC_COND), [
    "• Punto 8",
    "*Estudio Bíblico de la Congregación (conductor)*",
    "30 minutos",
  ]);
});

test("Estudio Bíblico (lector): sin duración (0 min)", () => {
  assert.deepEqual(renderPartLines(EBC_LECTOR), [
    "• Punto 8",
    "*Estudio Bíblico de la Congregación (lector)*",
    "Lector del estudio bíblico de la congregación",
  ]);
});

test("SMM estudiante: rol 'Como estudiante' y bloque Acompañante", () => {
  assert.deepEqual(renderPartLines(SMM_ESTUDIANTE), [
    "• Punto 4",
    "*Empiece conversaciones*",
    "4 minutos",
    "Como estudiante",
    "Acompañante:",
    "Patricia López",
  ]);
});

test("SMM ayudante: rol 'Como ayudante' y bloque Estudiante", () => {
  assert.deepEqual(renderPartLines(SMM_AYUDANTE), [
    "• Punto 5",
    "*Haga revisitas*",
    "5 minutos",
    "Como ayudante",
    "Estudiante:",
    "Daniela Ruiz",
  ]);
});

test("SMM sin acompañante asignado: muestra rol pero NO el bloque de contraparte", () => {
  const sin: MessagePart = { ...SMM_ESTUDIANTE, companionName: null };
  assert.deepEqual(renderPartLines(sin), [
    "• Punto 4",
    "*Empiece conversaciones*",
    "4 minutos",
    "Como estudiante",
  ]);
});

test("Duración de 1 minuto usa singular", () => {
  const p: MessagePart = { sortOrder: 1, sectionLabel: "Palabras de introducción", durationMinutes: 1 };
  assert.deepEqual(renderPartLines(p), ["• *Palabras de introducción*", "1 minuto"]);
});

// ─── Aviso inicial mensual (SIN hora) ─────────────────────────────────────────

test("Aviso inicial: saludo, intro con mes, fecha SIN hora y bendición", () => {
  const msg = buildMonthlyInitialMessage({
    personName: "Julio Díaz",
    monthName: "julio",
    items: [
      { ...TESOROS, meetingDateText: "viernes 10 de julio de 2026", sortDate: "2026-07-10" },
      { ...SMM_ESTUDIANTE, meetingDateText: "viernes 10 de julio de 2026", sortDate: "2026-07-10" },
    ],
  });
  assert.ok(msg.startsWith("Hola Julio Díaz.\n"));
  assert.ok(msg.includes("Le compartimos sus asignaciones para las reuniones del mes de julio."));
  assert.ok(msg.includes("*Viernes 10 de julio de 2026*"));
  // NO debe aparecer la hora en el aviso inicial.
  assert.ok(!/\b\d{1,2}:\d{2}\b/.test(msg), "El aviso inicial no debe incluir hora");
  assert.ok(!msg.includes("a.m.") && !msg.includes("p.m."), "El aviso inicial no debe incluir a.m./p.m.");
  assert.ok(msg.includes(BLESSING_LINE));
  assertMarkdownOk(msg);
  assertNoEmptyGaps(msg);
});

test("Aviso inicial: una persona con varias semanas del mes, ordenadas por fecha", () => {
  const msg = buildMonthlyInitialMessage({
    personName: "Ana",
    monthName: "julio",
    items: [
      { ...TESOROS, meetingDateText: "viernes 31 de julio de 2026", sortDate: "2026-07-31" },
      { ...LECTURA, meetingDateText: "viernes 3 de julio de 2026", sortDate: "2026-07-03" },
      { ...PRESIDENTE, meetingDateText: "viernes 10 de julio de 2026", sortDate: "2026-07-10" },
    ],
  });
  const i3 = msg.indexOf("Viernes 3 de julio");
  const i10 = msg.indexOf("Viernes 10 de julio");
  const i31 = msg.indexOf("Viernes 31 de julio");
  assert.ok(i3 < i10 && i10 < i31, "Las fechas deben ir en orden cronológico");
  assertMarkdownOk(msg);
  assertNoEmptyGaps(msg);
});

// ─── Recordatorios 7/3/1 días (CON hora) ──────────────────────────────────────

test("Recordatorio: incluye fecha, hora en 12h, partes ricas y bendición", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Julio Díaz",
    meetingDateText: "viernes 31 de julio de 2026",
    meetingTimeText: "19:00",
    parts: [TESOROS, SMM_ESTUDIANTE],
  });
  assert.ok(msg.startsWith("Hola Julio Díaz.\n"));
  assert.ok(msg.includes("Le recordamos sus asignaciones para la próxima reunión:"));
  assert.ok(msg.includes("*Viernes 31 de julio de 2026*"));
  assert.ok(msg.includes("7:00 p.m."), "El recordatorio SÍ debe incluir la hora");
  assert.ok(msg.includes("• Punto 1"));
  assert.ok(msg.includes("*Tesoros de la Biblia*"));
  assert.ok(msg.includes("Predique con valor"));
  assert.ok(msg.includes("Como estudiante"));
  assert.ok(msg.includes("Acompañante:\nPatricia López"));
  assert.ok(msg.includes(BLESSING_LINE));
  assertMarkdownOk(msg);
  assertNoEmptyGaps(msg);
});

test("Recordatorio de una sola parte usa singular en la introducción", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Luis",
    meetingDateText: "viernes 3 de julio de 2026",
    meetingTimeText: "19:00",
    parts: [LECTURA],
  });
  assert.ok(msg.includes("Le recordamos su asignación para la próxima reunión:"));
  assert.ok(msg.includes("7:00 p.m."));
  assertMarkdownOk(msg);
  assertNoEmptyGaps(msg);
});

test("Recordatorio: partes ordenadas por sortOrder (presidente antes que conclusión)", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Gabriel",
    meetingDateText: "viernes 3 de julio de 2026",
    meetingTimeText: "19:00",
    parts: [CONCLUSION, PRESIDENTE, TESOROS],
  });
  const iPres = msg.indexOf("Presidente");
  const iTes = msg.indexOf("Tesoros");
  const iConc = msg.indexOf("Palabras de conclusión");
  assert.ok(iPres < iTes && iTes < iConc);
});

test("Recordatorio sin hora conocida no imprime línea de hora", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Ana",
    meetingDateText: "viernes 3 de julio de 2026",
    meetingTimeText: null,
    parts: [LECTURA],
  });
  assert.ok(!msg.includes("a.m.") && !msg.includes("p.m."));
  assertNoEmptyGaps(msg);
});

// ─── formatMeetingTime ────────────────────────────────────────────────────────

test("Recordatorio de 7 días: SIN hora y SIN duración, sin repetir sección/título", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Gabriel de la Tórre",
    meetingDateText: "viernes 10 de julio de 2026",
    meetingTimeText: "15:00",
    parts: [TESOROS, EBC_COND],
    showTime: false,
    showDuration: false,
  });
  assert.ok(msg.includes("*Viernes 10 de julio de 2026*"));
  assert.ok(!msg.includes("p.m.") && !msg.includes("a.m."), "7 días no lleva hora");
  assert.ok(!/\bminutos?\b/.test(msg), "7 días no lleva duración");
  // No repite el título redundante del EBC.
  assert.ok(msg.includes("*Estudio Bíblico de la Congregación (conductor)*"));
  assert.ok(!msg.includes("\nEstudio bíblico de la congregación"), "no repite el título del EBC");
  // Tesoros sí conserva su título real (no es redundante).
  assert.ok(msg.includes("*Tesoros de la Biblia*") && msg.includes("Predique con valor"));
  assertMarkdownOk(msg);
  assertNoEmptyGaps(msg);
});

test("formatMeetingTime convierte 24h a am/pm y respeta valores no reconocidos", () => {
  assert.equal(formatMeetingTime("19:00"), "7:00 p.m.");
  assert.equal(formatMeetingTime("09:30"), "9:30 a.m.");
  assert.equal(formatMeetingTime("00:15"), "12:15 a.m.");
  assert.equal(formatMeetingTime("12:00"), "12:00 p.m.");
  assert.equal(formatMeetingTime(null), null);
  assert.equal(formatMeetingTime("7 pm"), "7 pm");
});

test("normaliza fecha es-MX (quita coma tras el día) y recorta el nombre", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Yesica Vazquez ",
    meetingDateText: "viernes, 24 de julio de 2026",
    meetingTimeText: "15:00",
    parts: [LECTURA],
  });
  assert.ok(msg.startsWith("Hola Yesica Vazquez.\n"), "el nombre no debe tener espacio antes del punto");
  assert.ok(msg.includes("*Viernes 24 de julio de 2026*"), "la fecha no debe llevar coma tras el día");
  assert.ok(!msg.includes(","), "no debe quedar ninguna coma en el encabezado");
  assert.ok(msg.includes("3:00 p.m."));
});
