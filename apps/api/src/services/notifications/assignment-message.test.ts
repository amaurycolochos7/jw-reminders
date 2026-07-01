import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAssignmentMessages, formatWeekLabel } from "./assignment-message.js";

test("formatWeekLabel produce '29 de junio a 5 de julio'", () => {
  assert.equal(formatWeekLabel("2026-06-29", "2026-07-05"), "29 de junio a 5 de julio");
});

const WEEK_LABEL = "29 de junio a 5 de julio";

test("primer mensaje al principal coincide con el ejemplo del spec", () => {
  const { primaryFirstNotice } = buildAssignmentMessages({
    itemNumber: 4,
    title: "Empiece conversaciones",
    durationMinutes: 3,
    context: "PREDICACIÓN INFORMAL",
    description: "Empiece una conversación después de que alguien haga o diga algo amable",
    reference: "lmd lección 1 punto 4",
    lesson: null,
    requiresAssistant: true,
    weekLabel: WEEK_LABEL,
    primaryName: "Ana",
    assistantName: "María",
  });

  const expected = [
    "Hola Ana, se te ha asignado una participación en la reunión de entre semana.",
    "",
    "📅 Semana: 29 de junio a 5 de julio",
    "🎤 Asignación: 4. Empiece conversaciones",
    "⏱ Duración: 3 minutos",
    "📍 Contexto: Predicación informal",
    "📘 Instrucción: Empiece una conversación después de que alguien haga o diga algo amable",
    "📖 Referencia: lmd lección 1 punto 4",
    "",
    "👤 Participante principal: Ana",
    "👥 Acompañante: María",
    "",
    "Por favor confirma que recibiste esta asignación.",
  ].join("\n");

  assert.equal(primaryFirstNotice, expected);
});

test("mensaje al acompañante incluye ambas personas", () => {
  const { companionFirstNotice } = buildAssignmentMessages({
    itemNumber: 4,
    title: "Empiece conversaciones",
    durationMinutes: 3,
    context: "PREDICACIÓN INFORMAL",
    description: "Empiece una conversación...",
    reference: "lmd lección 1 punto 4",
    requiresAssistant: true,
    weekLabel: WEEK_LABEL,
    primaryName: "Ana",
    assistantName: "María",
  });
  assert.ok(companionFirstNotice);
  assert.ok(companionFirstNotice!.startsWith("Hola María, se te ha asignado participar como acompañante"));
  assert.ok(companionFirstNotice!.includes("👤 Participante principal: Ana"));
  assert.ok(companionFirstNotice!.includes("👥 Acompañante: María"));
});

test("recordatorio corto para ambos", () => {
  const { reminder } = buildAssignmentMessages({
    itemNumber: 4, title: "Empiece conversaciones", durationMinutes: 3,
    requiresAssistant: true, weekLabel: WEEK_LABEL, primaryName: "Ana", assistantName: "María",
  });
  const expected = [
    "Recordatorio de asignación:",
    "",
    "📅 Semana: 29 de junio a 5 de julio",
    "🎤 4. Empiece conversaciones",
    "⏱ 3 minutos",
    "👤 Principal: Ana",
    "👥 Acompañante: María",
  ].join("\n");
  assert.equal(reminder, expected);
});

test("sin contexto: no aparece contextLine; sin itemNumber: sólo el título", () => {
  const { primaryFirstNotice } = buildAssignmentMessages({
    itemNumber: null,
    title: "Lectura de la Biblia",
    durationMinutes: 4,
    context: null,
    description: "Jer 12:1-11",
    reference: null,
    lesson: "th lección 2",
    requiresAssistant: false,
    weekLabel: WEEK_LABEL,
    primaryName: "Luis",
    assistantName: null,
  });
  assert.ok(primaryFirstNotice);
  assert.ok(!primaryFirstNotice!.includes("📍 Contexto:"), "no debe incluir contextLine");
  assert.ok(!primaryFirstNotice!.includes("👥 Acompañante:"), "no debe incluir acompañante");
  assert.ok(primaryFirstNotice!.includes("🎤 Asignación: Lectura de la Biblia"), "sólo el título, sin número");
  assert.ok(primaryFirstNotice!.includes("📖 Referencia: th lección 2"));
});

test("referenceAndLesson une reference y lesson con '; '", () => {
  const { primaryFirstNotice } = buildAssignmentMessages({
    itemNumber: 6, title: "Discurso", durationMinutes: 5, context: null,
    description: "Título: Jesús fue un gran maestro y sus consejos siempre funcionan",
    reference: "lmd apéndice A punto 17", lesson: "th lección 14",
    requiresAssistant: false, weekLabel: WEEK_LABEL, primaryName: "Carlos", assistantName: null,
  });
  assert.ok(primaryFirstNotice!.includes("📖 Referencia: lmd apéndice A punto 17; th lección 14"));
});

test("sin participante principal: no se genera mensaje y hay advertencia", () => {
  const res = buildAssignmentMessages({
    title: "Empiece conversaciones", requiresAssistant: true, weekLabel: WEEK_LABEL,
    primaryName: null, assistantName: "María",
  });
  assert.equal(res.primaryFirstNotice, null);
  assert.equal(res.companionFirstNotice, null);
  assert.equal(res.reminder, null);
  assert.ok(res.warnings.some((w) => w.includes("falta el participante principal")));
});

test("requiere acompañante pero no hay: advertencia (sigue enviando al principal)", () => {
  const res = buildAssignmentMessages({
    title: "Haga revisitas", requiresAssistant: true, weekLabel: WEEK_LABEL,
    primaryName: "Ana", assistantName: null,
  });
  assert.ok(res.primaryFirstNotice);
  assert.equal(res.companionFirstNotice, null);
  assert.ok(res.warnings.some((w) => w.includes("requiere acompañante")));
});
