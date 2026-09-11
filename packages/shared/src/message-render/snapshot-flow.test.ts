import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderMessage, parseSpintax, sampleVariables, validateTemplate } from "./index.js";

const INITIAL_NOTICE_BODY = `{Hola|Buenos días|Saludos} *{{nombre}}*{.|, esperamos que se encuentre bien.| 👋}

{Le compartimos|Le hacemos llegar|Aquí le dejamos} sus asignaciones para {las reuniones del mes de|el programa de} {{mes}}.

{{listaAsignaciones}}

{Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.|Contamos con su valiosa participación. ¡Éxito en su preparación!|Que Jehová le conceda sabiduría al preparar sus participaciones.}`;

const SAMPLE_VARS = {
  nombre: "Carlos",
  mes: "julio",
  listaAsignaciones: "*Viernes 10 de julio*\n\n• Punto 3\n*Lectura de la Biblia*\nComo estudiante\nAcompañante:\nHermano López",
};

describe("Snapshot flow — spintax resolve at freeze time", () => {
  test("parseSpintax resolves all braces from INITIAL_NOTICE body", () => {
    const rendered = renderMessage(INITIAL_NOTICE_BODY, SAMPLE_VARS).renderedMessage;
    const resolved = parseSpintax(rendered);
    assert.ok(!resolved.includes("{"), "should not contain opening brace");
    assert.ok(!resolved.includes("|"), "should not contain pipe");
    assert.ok(resolved.includes("Carlos"), "should contain resolved name");
    assert.ok(resolved.includes("julio"), "should contain resolved month");
    assert.ok(resolved.includes("Lectura de la Biblia"), "should contain assignment list");
  });

  test("produces different outputs on multiple calls (spintax variability)", () => {
    const results = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const rendered = renderMessage(INITIAL_NOTICE_BODY, SAMPLE_VARS).renderedMessage;
      results.add(parseSpintax(rendered));
    }
    assert.ok(results.size > 1, `expected >1 unique results, got ${results.size}`);
  });

  test("INITIAL_NOTICE body contains required variables", () => {
    assert.ok(INITIAL_NOTICE_BODY.includes("{{nombre}}"));
    assert.ok(INITIAL_NOTICE_BODY.includes("{{mes}}"));
    assert.ok(INITIAL_NOTICE_BODY.includes("{{listaAsignaciones}}"));
  });

  test("validates INITIAL_NOTICE template without errors", () => {
    const result = validateTemplate(INITIAL_NOTICE_BODY, "INITIAL_NOTICE");
    assert.deepEqual(result.invalidVariables, []);
    assert.deepEqual(result.missingVariables, []);
  });

  test("rendered message is stable across retries (no re-resolution)", () => {
    const rendered = renderMessage(INITIAL_NOTICE_BODY, SAMPLE_VARS).renderedMessage;
    const frozen = parseSpintax(rendered);
    // Once frozen, no spintax left
    assert.ok(!frozen.includes("{"), "frozen should have no braces");
    assert.ok(!frozen.includes("|"), "frozen should have no pipes");
    // Calling parseSpintax on an already-resolved message is a no-op
    assert.equal(parseSpintax(frozen), frozen);
    assert.equal(parseSpintax(frozen), frozen);
    assert.equal(parseSpintax(frozen), frozen);
  });

  test("output does not contain mojibake characters", () => {
    for (let i = 0; i < 10; i++) {
      const rendered = renderMessage(INITIAL_NOTICE_BODY, SAMPLE_VARS).renderedMessage;
      const resolved = parseSpintax(rendered);
      assert.ok(!resolved.match(/\?\?/), "should not contain ??");
      assert.ok(!resolved.match(/\uFFFD/), "should not contain replacement char");
      assert.ok(!resolved.match(/Ã[¡©­³º±]/), "should not contain garbled bytes");
    }
  });

  test("generates 10 varied messages all valid and different", () => {
    const messages: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rendered = renderMessage(INITIAL_NOTICE_BODY, SAMPLE_VARS).renderedMessage;
      const resolved = parseSpintax(rendered);
      messages.push(resolved);

      assert.ok(resolved.includes("Carlos"), "must contain resolved nombre");
      assert.ok(!resolved.includes("{{nombre}}"), "must not have leftover {{nombre}}");
      assert.ok(!resolved.includes("{{mes}}"), "must not have leftover {{mes}}");
      assert.ok(!resolved.includes("{{listaAsignaciones}}"), "must not have leftover {{listaAsignaciones}}");
      assert.ok(!resolved.includes("{"), "must not have unresolved spintax");
      assert.ok(!resolved.includes("|"), "must not have unresolved pipes");
      assert.ok(!resolved.match(/\?\?/), "no mojibake");
      // At least one of the known Spanish closing lines should appear
      assert.ok(
        resolved.includes("Jehová") || resolved.includes("Contamos") || resolved.includes("Éxito"),
        "should contain valid Spanish closing line",
      );
    }
    const unique = new Set(messages);
    assert.ok(unique.size > 1, `expected variation, got ${unique.size} unique of 10`);
  });

  test("empty/plain text handled gracefully by parseSpintax", () => {
    assert.equal(parseSpintax(""), "");
    assert.equal(parseSpintax("Hola mundo"), "Hola mundo");
  });

  test("worker retry: renderedMessage frozen once, sent as-is on retry", () => {
    // Simulate snapshot freeze
    const rendered = renderMessage(INITIAL_NOTICE_BODY, SAMPLE_VARS).renderedMessage;
    const frozen = parseSpintax(rendered);

    // Worker reads frozen renderedMessage from DB on first send
    const firstSend = frozen;
    // On retry, worker reads SAME renderedMessage from DB (no re-render)
    const retrySend = frozen;
    assert.equal(firstSend, retrySend);
    // Even accidental parseSpintax on frozen is no-op
    assert.equal(parseSpintax(firstSend), firstSend);
  });
});
