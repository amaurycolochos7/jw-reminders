import assert from "node:assert/strict";
import test from "node:test";
import { itemLooksComplete } from "./wol-importer.service.js";
import type { ParsedProgramItem } from "./wol-parser.js";

function makeItem(overrides: Partial<ParsedProgramItem>): ParsedProgramItem {
  return {
    itemNumber: null,
    section: null,
    title: "Parte",
    assignmentType: "OTHER",
    durationMinutes: 5,
    context: null,
    description: null,
    reference: null,
    lesson: null,
    requiresAssistant: false,
    requiresAssignee: true,
    sortOrder: 0,
    rawText: "",
    ...overrides,
  };
}

test("una parte asignable con título y duración está completa", () => {
  assert.equal(itemLooksComplete(makeItem({ durationMinutes: 5 })), true);
});

test("una parte asignable SIN duración está incompleta", () => {
  assert.equal(itemLooksComplete(makeItem({ durationMinutes: null })), false);
});

test("una parte SIN título está incompleta", () => {
  assert.equal(itemLooksComplete(makeItem({ title: "" })), false);
});

test("una canción sin duración NO se considera incompleta (no debe forzar NEEDS_REVIEW)", () => {
  const song = makeItem({
    title: "Canción 106 y oración",
    assignmentType: "SONG",
    durationMinutes: null,
    requiresAssignee: false,
  });
  assert.equal(itemLooksComplete(song), true);
});

test("una parte no asignable sin duración NO se considera incompleta", () => {
  const info = makeItem({
    title: "Parte informativa",
    durationMinutes: null,
    requiresAssignee: false,
  });
  assert.equal(itemLooksComplete(info), true);
});
