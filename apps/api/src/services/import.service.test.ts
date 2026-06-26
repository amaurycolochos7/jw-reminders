import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, validateProgram, normalizeProgram } from "./import.service.js";
import { manualProvider } from "./providers/manual.provider.js";
import { importProvider } from "./providers/import.provider.js";

test("parser + validator: payload valido pasa la validacion", () => {
  const raw = {
    source: "import",
    data: {
      year: 2026, month: 7, name: "Julio 2026",
      weeks: [
        { meetingDate: "2026-07-03", meetingTime: "19:00", parts: [
          { number: 1, section: "BIBLE_READING", type: "BIBLE_READING", title: "Lectura de la Biblia", duration: 4 },
          { number: 2, section: "APPLY_YOURSELF", type: "START_CONVERSATION", title: "Empiece conversaciones" },
        ] },
      ],
    },
  };
  const parsed = parseProgram(raw);
  const v = validateProgram(parsed);
  assert.equal(v.valid, true, v.errors.join("; "));
});

test("validator detecta errores: sin titulo, seccion/tipo invalidos, sin semanas", () => {
  const bad = parseProgram({ source: "import", data: { year: 2026, month: 7, weeks: [
    { meetingDate: "2026-07-03", parts: [ { section: "FOO", type: "BAR" } ] },
  ] } });
  const v = validateProgram(bad);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.includes("titulo")));
  assert.ok(v.errors.some((e) => e.includes("seccion")));
  assert.ok(v.errors.some((e) => e.includes("tipo")));

  const noWeeks = validateProgram(parseProgram({ source: "import", data: { year: 2026, month: 7, weeks: [] } }));
  assert.ok(noWeeks.errors.some((e) => e.toLowerCase().includes("semanas")));
});

test("normalizer: calcula lunes, numera secuencial e infiere acompanante", () => {
  const parsed = parseProgram({ source: "import", data: { year: 2026, month: 7, weeks: [
    { meetingDate: "2026-07-03", parts: [
      { type: "BIBLE_READING", title: "Lectura" },
      { type: "START_CONVERSATION", title: "Empiece" },
      { type: "TALK", title: "Discurso" },
    ] },
  ] } });
  const n = normalizeProgram(parsed);
  assert.equal(n.weeks.length, 1);
  const w = n.weeks[0];
  // 2026-07-03 is a Friday -> Monday of that week is 2026-06-29
  assert.equal(w.weekStartDateLocal, "2026-06-29");
  assert.equal(w.meetingTime, "19:00");
  assert.deepEqual(w.parts.map((p) => p.assignmentNumber), [1, 2, 3]);
  // Bible reading + talk: no companion; start conversation: companion
  assert.equal(w.parts[0].needsCompanion, false);
  assert.equal(w.parts[0].section, "BIBLE_READING");
  assert.equal(w.parts[1].needsCompanion, true);
  assert.equal(w.parts[1].section, "APPLY_YOURSELF");
  assert.equal(w.parts[2].needsCompanion, false);
});

test("ManualProvider: produce semanas del mes con partes estandar", async () => {
  const raw = await manualProvider.fetchRaw({ year: 2026, month: 7, meetingDayOfWeek: 5, meetingTime: "19:00" });
  const parsed = parseProgram(raw);
  const v = validateProgram(parsed);
  assert.equal(v.valid, true, v.errors.join("; "));
  const n = normalizeProgram(parsed);
  // July 2026 has Fridays on 3,10,17,24,31 -> 5 weeks
  assert.equal(n.weeks.length, 5);
  assert.equal(n.weeks[0].parts.length, 4); // standard preset
  assert.equal(n.year, 2026);
});

test("ManualProvider extended: 6 partes con Discurso y Explique", async () => {
  const raw = await manualProvider.fetchRaw({ year: 2026, month: 7, preset: "extended" });
  const n = normalizeProgram(parseProgram(raw));
  assert.equal(n.weeks[0].parts.length, 6);
  assert.ok(n.weeks[0].parts.some((p) => p.assignmentType === "TALK"));
});

test("ImportProvider: acepta JSON string y objeto", async () => {
  const obj = { year: 2026, month: 7, weeks: [{ meetingDate: "2026-07-03", parts: [{ type: "BIBLE_READING", title: "Lectura" }] }] };
  const fromObj = await importProvider.fetchRaw({ payload: obj });
  const fromStr = await importProvider.fetchRaw({ payload: JSON.stringify(obj) });
  assert.equal(validateProgram(parseProgram(fromObj)).valid, true);
  assert.equal(validateProgram(parseProgram(fromStr)).valid, true);
  await assert.rejects(() => importProvider.fetchRaw({ payload: "{not json" }));
});
