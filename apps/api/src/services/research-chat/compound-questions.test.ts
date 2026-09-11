/**
 * Compound Question Parser Tests
 *
 * Tests for the 4 mandatory cases:
 * 1. Multiple questions with personal application
 * 2. Single question with multiple explicit references
 * 3. Two questions without references (lesson + application)
 * 4. Invalid reference → UNVERIFIED state
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCompoundQuestion,
  determineSourceStatus,
  validateResponseCoverage,
  parseAllReferences,
} from "@jw-reminders/shared";

// ─── Case 1: Multiple questions with personal application ───

const CASE_1 = "¿Por qué es importante que los precursores se mantengan al día con las explicaciones más recientes? ¿Cómo has pensado hacerlo tú? (w10 15/7 pág. 24 párr. 15).";

test("Case 1: Detects 2 questions", () => {
  const result = parseCompoundQuestion(CASE_1);
  assert.equal(result.questionCount, 2, `Expected 2, got ${result.questionCount}`);
});

test("Case 1: First question has intent 'reason'", () => {
  const result = parseCompoundQuestion(CASE_1);
  assert.equal(result.subQuestions[0].intent, "reason");
});

test("Case 1: Second question has intent 'personal_application'", () => {
  const result = parseCompoundQuestion(CASE_1);
  assert.equal(result.subQuestions[1].intent, "personal_application");
});

test("Case 1: requiresPersonalApplication is true", () => {
  const result = parseCompoundQuestion(CASE_1);
  assert.equal(result.requiresPersonalApplication, true);
});

test("Case 1: Detects 1 explicit reference (w10 15/7 pág. 24 párr. 15)", () => {
  const result = parseCompoundQuestion(CASE_1);
  assert.equal(result.explicitReferences.length, 1);
  assert.ok(result.explicitReferences[0].includes("w10"));
});

test("Case 1: parseAllReferences detects the WOL reference", () => {
  const { allRefs } = parseAllReferences(CASE_1);
  assert.ok(allRefs.length >= 1);
  const wolRef = allRefs.find((r) => r.type === "wol");
  assert.ok(wolRef, "Should detect a WOL reference");
  if (wolRef && "publicationCode" in wolRef) {
    assert.equal(wolRef.publicationCode, "w10");
  }
});

test("Case 1: Good response passes validation", () => {
  const parsed = parseCompoundQuestion(CASE_1);
  const goodResponse = "Es importante que los precursores se mantengan al día porque toda la información reciente nos ayuda a mejorar. En mi caso, he pensado hacerlo aprovechando momentos libres para leer artículos pendientes.";

  const validation = validateResponseCoverage(parsed, goodResponse, "VERIFIED", 1, 0);
  assert.equal(validation.passed, true, `Issues: ${validation.issues.join("; ")}`);
  assert.equal(validation.personalApplicationIncluded, true);
});

test("Case 1: Response without personal application fails validation", () => {
  const parsed = parseCompoundQuestion(CASE_1);
  const badResponse = "Es importante que los precursores se mantengan al día porque toda la información reciente nos ayuda a ser mejores maestros de la verdad.";

  const validation = validateResponseCoverage(parsed, badResponse, "VERIFIED", 1, 0);
  assert.equal(validation.personalApplicationIncluded, false);
});

// ─── Case 2: Single question with multiple explicit references ───

const CASE_2 = "¿Cómo hacemos brillar nuestra luz? (Mat. 5:14-16; Mar. 13:10; w12 1/5 pág. 9 párr. 2).";

test("Case 2: Detects 1 question", () => {
  const result = parseCompoundQuestion(CASE_2);
  assert.equal(result.questionCount, 1);
});

test("Case 2: Detects 3 explicit references", () => {
  const result = parseCompoundQuestion(CASE_2);
  assert.equal(result.explicitReferences.length, 3);
});

test("Case 2: parseAllReferences finds 2 Bible + 1 WOL", () => {
  const { bibleRefs, wolRefs } = parseAllReferences(CASE_2);
  assert.equal(bibleRefs.length, 2);
  assert.equal(wolRefs.length, 1);
});

test("Case 2: All resolved → VERIFIED", () => {
  const status = determineSourceStatus(3, 3, 0);
  assert.equal(status, "VERIFIED");
});

test("Case 2: Some resolved, some not → PARTIAL", () => {
  const status = determineSourceStatus(3, 2, 1);
  assert.equal(status, "PARTIAL");
});

test("Case 2: Contradiction detected when showing sources + unresolved explicit refs", () => {
  const parsed = parseCompoundQuestion(CASE_2);
  const validation = validateResponseCoverage(
    parsed,
    "Hacemos brillar nuestra luz predicando.",
    "PARTIAL",
    2, // 2 sources shown
    1, // 1 unresolved
  );
  assert.equal(validation.hasContradictorySourceStatus, true);
});

// ─── Case 3: Two questions without references ───

const CASE_3 = "¿Qué aprendemos de este relato? ¿Cómo podemos aplicarlo en la predicación?";

test("Case 3: Detects 2 questions", () => {
  const result = parseCompoundQuestion(CASE_3);
  assert.equal(result.questionCount, 2);
});

test("Case 3: First question has intent 'lesson'", () => {
  const result = parseCompoundQuestion(CASE_3);
  assert.equal(result.subQuestions[0].intent, "lesson");
});

test("Case 3: Second question has intent 'method'", () => {
  const result = parseCompoundQuestion(CASE_3);
  assert.equal(result.subQuestions[1].intent, "method");
});

test("Case 3: No explicit references → AI_SUGGESTED", () => {
  const result = parseCompoundQuestion(CASE_3);
  assert.equal(result.explicitReferences.length, 0);
  const status = determineSourceStatus(0, 0, 0);
  assert.equal(status, "AI_SUGGESTED");
});

// ─── Case 4: Invalid reference → UNVERIFIED ───

const CASE_4 = "¿Qué aprendemos? (w99 99/99 pág. 999 párr. 999).";

test("Case 4: Detects 1 question and 1 explicit reference", () => {
  const result = parseCompoundQuestion(CASE_4);
  assert.equal(result.questionCount, 1);
  assert.equal(result.explicitReferences.length, 1);
});

test("Case 4: No references resolved → UNVERIFIED", () => {
  const status = determineSourceStatus(1, 0, 1);
  assert.equal(status, "UNVERIFIED");
});

test("Case 4: UNVERIFIED must not show used sources (validation catches contradiction)", () => {
  const parsed = parseCompoundQuestion(CASE_4);
  // Simulate: system couldn't resolve the reference but topic search found some sources
  const validation = validateResponseCoverage(
    parsed,
    "Aprendemos que debemos esforzarnos.",
    "UNVERIFIED",
    3, // 3 topic-search sources shown (this should be contradictory!)
    1, // 1 explicit ref unresolved
  );
  assert.equal(validation.hasContradictorySourceStatus, true);
});

test("Case 4: UNVERIFIED with 0 sources shown → no contradiction", () => {
  const parsed = parseCompoundQuestion(CASE_4);
  const validation = validateResponseCoverage(
    parsed,
    "Aprendemos que debemos esforzarnos.",
    "UNVERIFIED",
    0, // correctly hidden
    1,
  );
  assert.equal(validation.hasContradictorySourceStatus, false);
});
