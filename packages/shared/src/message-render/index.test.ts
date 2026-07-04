import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderMessage,
  validateTemplate,
  extractVariables,
  sampleVariables,
  TEMPLATE_VARIABLES,
} from "./index.js";
import {
  assembleMessageVariables,
  buildReminderAssignmentsList,
  buildInitialAssignmentsList,
} from "../grouped-message/index.js";

test("sustituye variables conservando el formato WhatsApp (negritas, saltos, emojis)", () => {
  const body = "Hola *{{nombre}}*.\n\n_Recuerda_ tu asignación 🙂\n\n{{listaAsignaciones}}";
  const r = renderMessage(body, {
    nombre: "Carlos",
    listaAsignaciones: "*Viernes 10 de julio*\n• Punto 3",
  });
  assert.equal(
    r.renderedMessage,
    "Hola *Carlos*.\n\n_Recuerda_ tu asignación 🙂\n\n*Viernes 10 de julio*\n• Punto 3",
  );
  assert.deepEqual(r.invalidVariables, []);
  assert.deepEqual(r.missingVariables, []);
});

test("NO impone emojis ni altera espacios/guiones que escribe el usuario", () => {
  const body = "- Punto uno\n-  dos espacios\n{{nombre}}";
  const r = renderMessage(body, { nombre: "Ana" });
  assert.equal(r.renderedMessage, "- Punto uno\n-  dos espacios\nAna");
});

test("marca variable conocida vacía como missing y avisa si es obligatoria", () => {
  const r = renderMessage("Hola {{nombre}}", { nombre: "" });
  assert.deepEqual(r.missingVariables, ["nombre"]);
  assert.ok(r.warnings.some((w) => w.includes("obligatoria")));
});

test("marca token desconocido como invalid y lo deja visible por defecto", () => {
  const r = renderMessage("Hola {{noExiste}}", {});
  assert.deepEqual(r.invalidVariables, ["noExiste"]);
  assert.equal(r.renderedMessage, "Hola {{noExiste}}");
});

test("blankUnknown reemplaza el token desconocido por vacío", () => {
  const r = renderMessage("Hola {{noExiste}}!", {}, { blankUnknown: true });
  assert.equal(r.renderedMessage, "Hola !");
});

test("detecta llaves malformadas", () => {
  const r = renderMessage("Hola {{nombre", { nombre: "x" });
  assert.ok(r.warnings.some((w) => w.includes("mal formadas")));
});

test("acepta alias con acento: {{compañero}} -> companero", () => {
  const r = renderMessage("Con {{compañero}}", { companero: "López" });
  assert.equal(r.renderedMessage, "Con López");
  assert.deepEqual(r.invalidVariables, []);
});

test("valida que una variable no aplique al tipo de mensaje", () => {
  // {{mes}} solo aplica a INITIAL_NOTICE
  const r = validateTemplate("Hola {{nombre}} en {{mes}}", "SEVEN_DAYS_BEFORE");
  assert.ok(r.warnings.some((w) => w.includes("no aplica")));
});

test("extractVariables devuelve nombres canónicos", () => {
  const vars = extractVariables("{{nombre}} {{compañero}} {{fecha}}");
  assert.deepEqual(vars.sort(), ["companero", "fecha", "nombre"]);
});

test("plantilla vacía avisa", () => {
  const r = renderMessage("   ", {});
  assert.ok(r.warnings.some((w) => w.includes("vacía")));
});

test("sampleVariables cubre todo el catálogo", () => {
  const s = sampleVariables();
  for (const v of TEMPLATE_VARIABLES) assert.ok(v.name in s, `falta ${v.name}`);
});

test("paridad: el mismo body+vars produce el mismo texto (idempotente)", () => {
  const body = "Hola *{{nombre}}*.\n{{listaAsignaciones}}\nGracias.";
  const vars = { nombre: "Carlos", listaAsignaciones: "• Punto 3\n*Lectura*" };
  const a = renderMessage(body, vars).renderedMessage;
  const b = renderMessage(body, vars).renderedMessage;
  assert.equal(a, b);
});

test("e2e recordatorio: plantilla real + {{listaAsignaciones}} => negritas y lista, idempotente (snapshot==re-render)", () => {
  const body =
    "Hola *{{nombre}}*.\n\nLe recordamos su asignación para la próxima reunión:\n\n{{listaAsignaciones}}\n\nQue Jehová bendiga su esfuerzo y preparación al presentar esta participación.";
  const lista = buildReminderAssignmentsList({
    meetingDateText: "viernes 10 de julio de 2026",
    meetingTimeText: "19:00",
    parts: [{ sortOrder: 1, pointNumber: 3, sectionLabel: "Lectura de la Biblia", title: "Lectura de la Biblia", isApplyYourself: false }],
    showTime: false,
    showDuration: false,
  });
  const vars = assembleMessageVariables({ personName: "Carlos", listaAsignaciones: lista });
  const r = renderMessage(body, vars, { templateType: "SEVEN_DAYS_BEFORE" });
  // nombre sustituido y negrita conservada
  assert.ok(r.renderedMessage.startsWith("Hola *Carlos*."));
  // el section label sale en negrita desde el bloque generado
  assert.ok(r.renderedMessage.includes("*Lectura de la Biblia*"));
  // no hay tokens/errores
  assert.deepEqual(r.invalidVariables, []);
  assert.deepEqual(r.missingVariables, []);
  // PARIDAD: re-render con mismos insumos = idéntico (snapshot == preview == envío)
  const again = renderMessage(body, vars, { templateType: "SEVEN_DAYS_BEFORE" }).renderedMessage;
  assert.equal(r.renderedMessage, again);
});

test("e2e aviso inicial: agrupa varias asignaciones de la persona en el bloque", () => {
  const lista = buildInitialAssignmentsList(
    [
      { sortOrder: 1, pointNumber: 3, sectionLabel: "Lectura de la Biblia", title: "Lectura de la Biblia", isApplyYourself: false, meetingDateText: "viernes 10 de julio de 2026", sortDate: "2026-07-10" },
      { sortOrder: 2, pointNumber: 5, sectionLabel: "Seamos Mejores Maestros", title: "Empiece conversaciones", isApplyYourself: true, recipientRole: "ASSIGNED", companionName: "Hna. López", meetingDateText: "viernes 17 de julio de 2026", sortDate: "2026-07-17" },
    ],
    { showDuration: false },
  );
  const body = "Hola *{{nombre}}*.\n\nSus asignaciones de {{mes}}:\n\n{{listaAsignaciones}}\n\nGracias.";
  const vars = assembleMessageVariables({ personName: "Ana", monthName: "julio", listaAsignaciones: lista });
  const r = renderMessage(body, vars, { templateType: "INITIAL_NOTICE" });
  // Contiene ambas fechas (dos asignaciones agrupadas en un solo mensaje)
  assert.ok(r.renderedMessage.includes("*Viernes 10 de julio de 2026*"));
  assert.ok(r.renderedMessage.includes("*Viernes 17 de julio de 2026*"));
  assert.ok(r.renderedMessage.includes("Hola *Ana*."));
  assert.ok(r.renderedMessage.includes("de julio")); // {{mes}} sustituido
});
