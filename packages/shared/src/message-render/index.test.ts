import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderMessage,
  validateTemplate,
  extractVariables,
  sampleVariables,
  TEMPLATE_VARIABLES,
} from "./index.js";

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
  // listaAsignaciones solo aplica a INITIAL_NOTICE
  const r = validateTemplate("Hola {{nombre}} {{listaAsignaciones}}", "SEVEN_DAYS_BEFORE");
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
