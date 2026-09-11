/**
 * Tests for research chat source-gating logic.
 *
 * Verifies the three critical scenarios:
 * - Case A: resolved WOL source → AI is called
 * - Case B: unresolved WOL source, no user text → AI is NOT called
 * - Case C: unresolved WOL source + user text → AI is called (user text is usable)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAllReferences } from "@jw-reminders/shared";

// ─── Source gating logic extracted for testing ───────────

interface ResolvedRef {
  type: string;
  raw: string;
  status: "resolved" | "unresolved" | "ambiguous" | "failed";
  title?: string;
  url?: string;
  excerpt?: string;
  notes?: string;
}

/**
 * Replicates the source-gating check from research-chat.routes.ts.
 * Returns { hasAnyUsableSource, usedSources, detectedButUnusedSources }.
 */
function evaluateSourceGating(message: string, resolvedRefs: ResolvedRef[]) {
  const userTextOnly = message.replace(/\(.*?\)/g, "").replace(/https?:\/\/\S+/g, "").trim();
  const hasUsableUserText = Boolean(userTextOnly && userTextOnly.length > 100);
  const hasResolvedWolSource = resolvedRefs.some(
    (s) => s.type === "wol" && s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 40
  );
  const hasResolvedWolLink = resolvedRefs.some(
    (s) => s.type === "wol_link" && s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 40
  );
  const hasResolvedBibleSource = resolvedRefs.some(
    (s) => s.type === "bible" && s.status === "resolved"
  );
  const hasAnyUsableSource = hasUsableUserText || hasResolvedWolSource || hasResolvedWolLink || hasResolvedBibleSource;

  const usedSources = resolvedRefs.filter(
    (s) => (s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 10) || s.type === "bible"
  );
  const detectedButUnusedSources = resolvedRefs.filter(
    (s) => s.status !== "resolved" || (!s.excerpt && s.type !== "bible")
  );

  return { hasAnyUsableSource, hasUsableUserText, usedSources, detectedButUnusedSources };
}

// ─── Case A: resolved WOL source → AI should be called ───

test("Case A: resolved WOL reference with excerpt allows AI generation", () => {
  const message = "¿Por qué hacía falta una nueva traducción? (w15 15/12 pág. 8 párrs. 16, 17).";
  const resolvedRefs: ResolvedRef[] = [
    {
      type: "wol",
      raw: "w15 15/12 pág. 8 párrs. 16, 17",
      status: "resolved",
      title: "Jehová se comunica con nosotros",
      url: "https://wol.jw.org/es/wol/s/r4/lp-s?q=La+Atalaya+2015+diciembre",
      excerpt: "La Biblia es la fuente del alimento espiritual. La Versión del Rey Jacobo de 1611 usaba lenguaje anticuado y contenía errores de traducción. Se necesitaba una Biblia exacta, fiel a los escritos originales y en lenguaje moderno.",
    },
  ];

  const result = evaluateSourceGating(message, resolvedRefs);

  assert.equal(result.hasAnyUsableSource, true, "Should have usable source");
  assert.equal(result.usedSources.length, 1, "Should have 1 used source");
  assert.equal(result.detectedButUnusedSources.length, 0, "Should have 0 unused sources");
  assert.equal(result.usedSources[0].raw, "w15 15/12 pág. 8 párrs. 16, 17");
});

// ─── Case B: unresolved WOL source, no user text → AI NOT called ───

test("Case B: unresolved WOL reference without user text blocks AI generation", () => {
  // The question is short (even "¿Por qué hacía falta una nueva traducción?" at ~45 chars
  // is below the 100 char threshold for "usable user text")
  const message = "¿Por qué hacía falta una nueva traducción? (w99 99/99 pág. 999 párr. 99).";
  const resolvedRefs: ResolvedRef[] = [
    {
      type: "wol",
      raw: "w99 99/99 pág. 999 párr. 99",
      status: "unresolved",
      url: "https://wol.jw.org/es/wol/s/r4/lp-s?q=w99+99%2F99",
      notes: "Referencia detectada. No se pudo extraer contenido real.",
    },
  ];

  const result = evaluateSourceGating(message, resolvedRefs);

  assert.equal(result.hasAnyUsableSource, false, "Should NOT have usable source");
  assert.equal(result.hasUsableUserText, false, "A question alone is not usable user text");
  assert.equal(result.usedSources.length, 0, "Should have 0 used sources");
  assert.equal(result.detectedButUnusedSources.length, 1, "Should have 1 unused source");
  assert.equal(result.detectedButUnusedSources[0].status, "unresolved");
});

test("Case B: failed WOL reference also blocks AI generation", () => {
  const message = "(w15 15/12 pág. 8 párrs. 16, 17)";
  const resolvedRefs: ResolvedRef[] = [
    {
      type: "wol",
      raw: "w15 15/12 pág. 8 párrs. 16, 17",
      status: "failed",
      notes: "Error al resolver: timeout",
    },
  ];

  const result = evaluateSourceGating(message, resolvedRefs);

  assert.equal(result.hasAnyUsableSource, false);
  assert.equal(result.detectedButUnusedSources.length, 1);
});

// ─── Case C: unresolved WOL + user text → AI called with user text ───

test("Case C: unresolved WOL but user provides sufficient text → allows AI generation", () => {
  const message = `¿Por qué hacía falta una nueva traducción?
Texto:
La Biblia es la fuente del alimento espiritual. La Versión del Rey Jacobo usaba lenguaje anticuado, contenía errores de traducción y solo usaba el nombre de Dios en unos pocos lugares. Además, incluía versículos que no estaban en los manuscritos más confiables. Se necesitaba una traducción fiel y moderna.
Referencia: w15 15/12 pág. 8 párrs. 16, 17`;

  const resolvedRefs: ResolvedRef[] = [
    {
      type: "wol",
      raw: "w15 15/12 pág. 8 párrs. 16, 17",
      status: "unresolved",
      url: "https://wol.jw.org/es/wol/s/r4/lp-s?q=La+Atalaya+2015+diciembre",
      notes: "Referencia detectada. No se pudo extraer contenido real.",
    },
  ];

  const result = evaluateSourceGating(message, resolvedRefs);

  assert.equal(result.hasAnyUsableSource, true, "User text is >40 chars, should be usable");
  assert.equal(result.hasUsableUserText, true, "Long user text detected");
  // WOL reference is still not used (it wasn't resolved)
  assert.equal(result.detectedButUnusedSources.length, 1);
});

// ─── Bible references should be usable ───

test("Bible reference (always resolved) counts as usable source", () => {
  const message = "¿Qué quiso decir Jesús? (Mateo 22:37)";
  const resolvedRefs: ResolvedRef[] = [
    {
      type: "bible",
      raw: "Mateo 22:37",
      status: "resolved",
      url: "https://wol.jw.org/es/wol/s/r4/lp-s?q=Mateo+22%3A37",
      title: "Mateo 22:37",
    },
  ];

  const result = evaluateSourceGating(message, resolvedRefs);

  assert.equal(result.hasAnyUsableSource, true);
  assert.equal(result.usedSources.length, 1);
});

// ─── WOL link resolved with excerpt → usable ───

test("WOL link resolved with excerpt is usable", () => {
  const message = "Comenta sobre este artículo: https://wol.jw.org/es/wol/d/r4/lp-s/2015926";
  const resolvedRefs: ResolvedRef[] = [
    {
      type: "wol_link",
      raw: "https://wol.jw.org/es/wol/d/r4/lp-s/2015926",
      status: "resolved",
      url: "https://wol.jw.org/es/wol/d/r4/lp-s/2015926",
      title: "Jehová se comunica con nosotros",
      excerpt: "La Biblia es un tesoro invaluable. Por medio de ella, Jehová nos proporciona alimento espiritual en abundancia.",
    },
  ];

  const result = evaluateSourceGating(message, resolvedRefs);

  assert.equal(result.hasAnyUsableSource, true);
  assert.equal(result.usedSources.length, 1);
});

// ─── Resolved WOL without excerpt is NOT usable ───

test("WOL resolved without excerpt is NOT considered usable for AI", () => {
  const message = "(w15 15/12 pág. 8 párrs. 16, 17)";
  const resolvedRefs: ResolvedRef[] = [
    {
      type: "wol",
      raw: "w15 15/12 pág. 8 párrs. 16, 17",
      status: "resolved",
      title: "Jehová se comunica con nosotros",
      // No excerpt - title only
    },
  ];

  const result = evaluateSourceGating(message, resolvedRefs);

  // Even though status is "resolved", without an excerpt it shouldn't trigger AI
  assert.equal(result.hasAnyUsableSource, false);
  assert.equal(result.detectedButUnusedSources.length, 1);
});

// ─── Reference parser correctly extracts w15 15/12 pattern ───

test("Parser correctly detects w15 15/12 pág. 8 párrs. 16, 17", () => {
  const text = "¿Por qué hacía falta una nueva traducción? (w15 15/12 pág. 8 párrs. 16, 17).";
  const { wolRefs } = parseAllReferences(text);

  assert.equal(wolRefs.length, 1);
  const ref = wolRefs[0] as any;
  assert.equal(ref.type, "wol");
  assert.equal(ref.publicationCode, "w15");
  assert.equal(ref.date, "15/12");
  assert.equal(ref.page, 8);
  assert.deepEqual(ref.paragraphs, [16, 17]);
});

test("Parser detects invalid reference w99 99/99 pág. 999 párr. 99", () => {
  const text = "Test (w99 99/99 pág. 999 párr. 99).";
  const { wolRefs } = parseAllReferences(text);

  assert.equal(wolRefs.length, 1);
  const ref = wolRefs[0] as any;
  assert.equal(ref.type, "wol");
  assert.equal(ref.publicationCode, "w99");
  assert.deepEqual(ref.paragraphs, [99]);
});

// ─── Mixed: some resolved, some not ───

test("Mixed sources: only resolved ones count as usable", () => {
  const message = "Compara (w15 15/12 pág. 8 párrs. 16, 17) con (w99 99/99 pág. 1 párr. 1)";
  const resolvedRefs: ResolvedRef[] = [
    {
      type: "wol",
      raw: "w15 15/12 pág. 8 párrs. 16, 17",
      status: "resolved",
      title: "Jehová se comunica con nosotros",
      excerpt: "La Biblia es la fuente del alimento espiritual necesario para fortalecer nuestra relación con Jehová.",
    },
    {
      type: "wol",
      raw: "w99 99/99 pág. 1 párr. 1",
      status: "unresolved",
      notes: "Referencia detectada. No se pudo extraer contenido real.",
    },
  ];

  const result = evaluateSourceGating(message, resolvedRefs);

  assert.equal(result.hasAnyUsableSource, true, "Has one resolved source");
  assert.equal(result.usedSources.length, 1);
  assert.equal(result.detectedButUnusedSources.length, 1);
  assert.equal(result.usedSources[0].raw, "w15 15/12 pág. 8 párrs. 16, 17");
  assert.equal(result.detectedButUnusedSources[0].raw, "w99 99/99 pág. 1 párr. 1");
});
