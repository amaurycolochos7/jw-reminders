import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupedPersonMessage,
  buildMonthlyInitialMessage,
  formatMeetingTime,
} from "@jw-reminders/shared";

test("una sola parte produce mensaje individual (sin viñetas)", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Gabriel",
    meetingDateText: "viernes 3 de julio",
    meetingTimeText: "19:00",
    parts: [{ title: "Oración final", sortOrder: 9000 }],
  });
  assert.ok(msg.includes("Hola Gabriel."));
  assert.ok(msg.includes("Oración final."));
  assert.ok(!msg.includes("•"));
  assert.ok(msg.includes("Hora de reunión: 7:00 p.m."));
});

test("varias partes se agrupan en un mensaje ordenado por sortOrder", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Gabriel",
    meetingDateText: "viernes 3 de julio",
    meetingTimeText: "19:00",
    parts: [
      { title: "Oración final", sortOrder: 9000 },
      { title: "Presidente", sortOrder: -100 },
      { title: "Tesoros de la Biblia: Cómo competir", sortOrder: 5 },
    ],
  });
  const idxPres = msg.indexOf("Presidente");
  const idxTes = msg.indexOf("Tesoros");
  const idxOra = msg.indexOf("Oración final");
  // Orden por sortOrder: Presidente (-100) < Tesoros (5) < Oración (9000).
  assert.ok(idxPres < idxTes && idxTes < idxOra);
  assert.ok(msg.includes("Estas son sus asignaciones"));
  assert.ok(msg.includes("• Presidente."));
});

test("sin hora conocida no se incluye la línea de hora", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Ana",
    meetingDateText: "viernes 3 de julio",
    meetingTimeText: null,
    parts: [{ title: "Lectura de la Biblia", sortOrder: 1 }],
  });
  assert.ok(!msg.includes("Hora de reunión"));
});

test("formatMeetingTime convierte 24h a am/pm y respeta valores no reconocidos", () => {
  assert.equal(formatMeetingTime("19:00"), "7:00 p.m.");
  assert.equal(formatMeetingTime("09:30"), "9:30 a.m.");
  assert.equal(formatMeetingTime("00:15"), "12:15 a.m.");
  assert.equal(formatMeetingTime("12:00"), "12:00 p.m.");
  assert.equal(formatMeetingTime(null), null);
  assert.equal(formatMeetingTime("7 pm"), "7 pm");
});

test("aviso inicial mensual: agrupa por fecha, marca acompañante, incluye bendición y sin puntualidad", () => {
  const msg = buildMonthlyInitialMessage({
    personName: "Javier",
    monthLabel: "Julio 2026",
    items: [
      { meetingDateText: "viernes 10 de julio", meetingTimeText: "19:00", sortDate: "2026-07-10", sortOrder: 1, assignmentNumber: 1, title: "Presidente de la reunión" },
      { meetingDateText: "viernes 10 de julio", meetingTimeText: "19:00", sortDate: "2026-07-10", sortOrder: 2, assignmentNumber: 2, title: "Oración inicial" },
      { meetingDateText: "viernes 3 de julio", meetingTimeText: "19:00", sortDate: "2026-07-03", sortOrder: 5, assignmentNumber: 4, title: "Empiece conversaciones", durationMinutes: 3, isCompanion: true },
    ],
  });
  // Ordena por fecha: 3 de julio antes que 10 de julio (encabezado capitalizado).
  assert.ok(msg.indexOf("Viernes 3 de julio") < msg.indexOf("Viernes 10 de julio"));
  // Marca acompañante y muestra duración/número.
  assert.ok(msg.includes("como acompañante"));
  assert.ok(msg.includes("4. Empiece conversaciones") && msg.includes("3 min"));
  // Fecha en negrita y hora en 12h.
  assert.ok(msg.includes("*Viernes 3 de julio* — 7:00 p.m."));
  // Mes en negrita.
  assert.ok(msg.includes("*Julio 2026*"));
  // Sin emoji de calendario.
  assert.ok(!msg.includes("📅"));
  // Bendición y sin puntualidad.
  assert.ok(msg.includes("Que Jehová bendiga su esfuerzo y preparación"));
  assert.ok(!/puntual|temprano/i.test(msg));
});

test("recordatorio agrupado incluye bendición y no menciona puntualidad", () => {
  const msg = buildGroupedPersonMessage({
    personName: "Ana",
    meetingDateText: "viernes 10 de julio",
    meetingTimeText: "19:00",
    parts: [
      { title: "Lectura de la Biblia", sortOrder: 1 },
      { title: "Discurso", sortOrder: 6 },
    ],
  });
  assert.ok(msg.includes("Que Jehová bendiga su esfuerzo y preparación"));
  assert.ok(!/puntual|temprano/i.test(msg));
});
