import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReminderAssignmentsList,
  buildInitialAssignmentsList,
  assembleMessageVariables,
  type MessagePart,
} from "./index.js";

const part = (over: Partial<MessagePart> = {}): MessagePart => ({
  sortOrder: 1,
  pointNumber: 3,
  sectionLabel: "Lectura de la Biblia",
  title: "Lectura de la Biblia",
  isApplyYourself: false,
  ...over,
});

test("buildReminderAssignmentsList: fecha en negrita + punto + sección, sin hora", () => {
  const out = buildReminderAssignmentsList({
    meetingDateText: "viernes 10 de julio de 2026",
    meetingTimeText: "19:00",
    parts: [part()],
    showTime: false,
    showDuration: false,
  });
  assert.ok(out.startsWith("*Viernes 10 de julio de 2026*"));
  assert.ok(out.includes("• Punto 3"));
  assert.ok(out.includes("*Lectura de la Biblia*"));
  assert.ok(!/\d{1,2}:\d{2}/.test(out), "sin hora cuando showTime=false");
});

test("buildReminderAssignmentsList: Seamos Mejores Maestros incluye rol y acompañante", () => {
  const out = buildReminderAssignmentsList({
    meetingDateText: "viernes 10 de julio de 2026",
    parts: [part({ isApplyYourself: true, recipientRole: "ASSIGNED", companionName: "Hna. López", sectionLabel: "Seamos Mejores Maestros", title: "Empiece conversaciones" })],
    showTime: false,
    showDuration: false,
  });
  assert.ok(out.includes("Como estudiante"));
  assert.ok(out.includes("Acompañante:"));
  assert.ok(out.includes("Hna. López"));
});

test("buildInitialAssignmentsList: agrupa por fecha (2 fechas → 2 secciones)", () => {
  const out = buildInitialAssignmentsList(
    [
      { ...part(), meetingDateText: "viernes 10 de julio de 2026", sortDate: "2026-07-10" },
      { ...part({ sortOrder: 2, pointNumber: 5, sectionLabel: "Discurso", title: "Tema" }), meetingDateText: "viernes 17 de julio de 2026", sortDate: "2026-07-17" },
    ],
    { showDuration: false },
  );
  assert.ok(out.includes("*Viernes 10 de julio de 2026*"));
  assert.ok(out.includes("*Viernes 17 de julio de 2026*"));
  // ordena por sortDate
  assert.ok(out.indexOf("10 de julio") < out.indexOf("17 de julio"));
});

test("buildInitialAssignmentsList: ordena partes del mismo día por sortOrder", () => {
  const out = buildInitialAssignmentsList(
    [
      { ...part({ sortOrder: 2, title: "Segunda", sectionLabel: "Segunda" }), meetingDateText: "viernes 10 de julio de 2026", sortDate: "2026-07-10" },
      { ...part({ sortOrder: 1, title: "Primera", sectionLabel: "Primera" }), meetingDateText: "viernes 10 de julio de 2026", sortDate: "2026-07-10" },
    ],
    { showDuration: false },
  );
  assert.ok(out.indexOf("Primera") < out.indexOf("Segunda"));
});

test("assembleMessageVariables: hora se formatea a 12h; campos opcionales vacíos", () => {
  const v = assembleMessageVariables({ personName: " Ana ", listaAsignaciones: "X", meetingTimeText: "19:00" });
  assert.equal(v.nombre, "Ana");
  assert.equal(v.hora, "7:00 p.m.");
  assert.equal(v.mes, "");
  assert.equal(v.listaAsignaciones, "X");
});
