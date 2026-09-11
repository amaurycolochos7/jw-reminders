/**
 * STRICT Tests: Topic search + doctrinal ranking + source validation
 * Run: npx tsx scripts/_test_topic_search.ts
 *
 * These tests FAIL if expected references are not in the top results.
 */

import { searchByTopic } from "../apps/api/src/services/research-chat/topic-search.service.js";
import { resolveFromLocal } from "../apps/api/src/services/research-chat/bible-local-resolver.service.js";
import { validateSources } from "../apps/api/src/services/research-chat/source-validator.service.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) { console.log(`     ✗ FAIL: ${msg}`); return false; }
  console.log(`     ✓ ${msg}`);
  return true;
}

function refInTop(results: any[], ref: string, topN: number): boolean {
  return results.slice(0, topN).some((r: any) => r.reference === ref);
}

function refPosition(results: any[], ref: string): number {
  const idx = results.findIndex((r: any) => r.reference === ref);
  return idx === -1 ? -1 : idx + 1; // 1-based
}

console.log("═══════════════════════════════════════════════════");
console.log("  STRICT TOPIC SEARCH + RANKING TESTS (Phase 3)  ");
console.log("═══════════════════════════════════════════════════\n");

// ─── Test A: Cobrar por enseñar ──────────────────────────
{
  console.log("── A) Cobrar por enseñar ──");
  console.log('   Input: "Qué dice la Biblia sobre cobrar por enseñar de Dios"');
  const r = searchByTopic("Qué dice la Biblia sobre cobrar por enseñar de Dios");
  console.log(`   Bible results: ${r.bibleResults.length}`);
  for (const b of r.bibleResults.slice(0, 7)) {
    console.log(`     #${refPosition(r.bibleResults, b.reference)} ${b.reference} (score: ${b.score.toFixed(1)})`);
  }

  let ok = true;
  ok = assert(refInTop(r.bibleResults, "Mateo 10:8", 5), "Mateo 10:8 in top 5") && ok;
  ok = assert(refInTop(r.bibleResults, "Proverbios 23:23", 8), "Proverbios 23:23 in top 8") && ok;
  ok = assert(refInTop(r.bibleResults, "2 Corintios 2:17", 8), "2 Corintios 2:17 in top 8") && ok;

  if (ok) { passed++; console.log("   → PASS\n"); } else { failed++; console.log("   → FAIL\n"); }
}

// ─── Test B: Jeremías 12:5 explicit ──────────────────────
{
  console.log("── B) Perla de Jeremías 12:5 (explicit ref) ──");
  console.log('   Input: "Dame una perla de Jeremías 12:5"');
  const r = searchByTopic("Dame una perla de Jeremías 12:5");
  console.log(`   Bible results: ${r.bibleResults.length}`);
  for (const b of r.bibleResults.slice(0, 5)) {
    console.log(`     #${refPosition(r.bibleResults, b.reference)} ${b.reference} (score: ${b.score.toFixed(1)})`);
  }

  let ok = true;
  const jerPos = refPosition(r.bibleResults, "Jeremías 12:5");
  ok = assert(jerPos === 1, `Jeremías 12:5 must be #1 (got #${jerPos})`) && ok;

  // Verify it resolves from local
  const local = resolveFromLocal("Jeremías", 12, "5", "Jeremías 12:5");
  ok = assert(local.status === "resolved", "Jeremías 12:5 resolves from local Bible") && ok;
  ok = assert(local.extractedContent.length > 0, "Has extracted content") && ok;

  if (ok) { passed++; console.log("   → PASS\n"); } else { failed++; console.log("   → FAIL\n"); }
}

// ─── Test C: Libro de precursores - maestro ──────────────
{
  console.log("── C) Libro de precursores - maestro ──");
  console.log('   Input: "Qué enseña el libro de precursores sobre mejorar como maestro"');
  const r = searchByTopic("Qué enseña el libro de precursores sobre mejorar como maestro");
  console.log(`   Precursor results: ${r.precursorResults.length}`);
  for (const p of r.precursorResults.slice(0, 5)) {
    console.log(`     [${p.source}] ${p.reference.slice(0, 70)} (score: ${p.score.toFixed(1)})`);
  }

  let ok = true;
  ok = assert(r.precursorResults.length > 0, "Has precursor results") && ok;
  ok = assert(
    r.precursorResults.some((p) => p.source === "precursor_lesson" || p.source === "precursor_extract"),
    "Has lesson or extract results (not just citations)"
  ) && ok;

  if (ok) { passed++; console.log("   → PASS\n"); } else { failed++; console.log("   → FAIL\n"); }
}

// ─── Test D: Explicar Mateo 10:8 (explicit ref) ─────────
{
  console.log("── D) Explicar Mateo 10:8 (explicit ref) ──");
  console.log('   Input: "Cómo puedo explicar Mateo 10:8 a un estudiante de la Biblia"');
  const r = searchByTopic("Cómo puedo explicar Mateo 10:8 a un estudiante de la Biblia");
  console.log(`   Bible results: ${r.bibleResults.length}`);
  for (const b of r.bibleResults.slice(0, 5)) {
    console.log(`     #${refPosition(r.bibleResults, b.reference)} ${b.reference} (score: ${b.score.toFixed(1)})`);
  }

  let ok = true;
  const matPos = refPosition(r.bibleResults, "Mateo 10:8");
  ok = assert(matPos === 1, `Mateo 10:8 must be #1 (got #${matPos})`) && ok;

  // Source validation
  const local = resolveFromLocal("Mateo", 10, "8", "Mateo 10:8");
  const validation = validateSources([{
    reference: "Mateo 10:8",
    type: "bible",
    status: local.status,
    sourceOrigin: local.sourceOrigin,
    url: local.url,
    extractedContent: local.extractedContent,
  }]);
  ok = assert(validation.totalValid === 1, "Source validation passes for Mateo 10:8") && ok;

  if (ok) { passed++; console.log("   → PASS\n"); } else { failed++; console.log("   → FAIL\n"); }
}

// ─── Test E: Predicación (broad topic search) ────────────
{
  console.log("── E) Investigar predicación ──");
  console.log('   Input: "Investiga sobre la predicación"');
  const r = searchByTopic("Investiga sobre la predicación");
  console.log(`   Bible: ${r.bibleResults.length}, Precursor: ${r.precursorResults.length}`);

  // Should have doctrinal boosted verses
  const topBibleRefs = r.bibleResults.slice(0, 8).map((b) => b.reference);
  console.log(`   Top Bible: ${topBibleRefs.join(", ")}`);

  let ok = true;
  ok = assert(r.bibleResults.length > 5, "Has substantial Bible results") && ok;
  ok = assert(r.precursorResults.length > 0, "Has precursor results") && ok;
  // At least some of the doctrinal map verses should appear
  const expectedPredicacion = ["Mateo 24:14", "Mateo 28:19", "Mateo 28:20", "Hechos 20:20", "2 Timoteo 4:2"];
  const foundExpected = expectedPredicacion.filter((v) => topBibleRefs.includes(v));
  ok = assert(foundExpected.length >= 2, `At least 2 doctrinal-boosted verses in top 8 (found: ${foundExpected.join(", ")})`) && ok;

  if (ok) { passed++; console.log("   → PASS\n"); } else { failed++; console.log("   → FAIL\n"); }
}

// ─── Test F: Forbidden words ─────────────────────────────
{
  console.log("── F) Forbidden words check ──");
  const FORBIDDEN = ["iglesia", "pastor", "culto", "bendiciones", "sermón"];
  const queries = ["predicación y enseñanza bíblica", "cobrar por enseñar", "humildad cristiana"];
  let ok = true;
  for (const q of queries) {
    const r = searchByTopic(q);
    const allTexts = [...r.bibleResults.map((x) => x.text), ...r.precursorResults.map((x) => x.text)].join(" ").toLowerCase();
    for (const word of FORBIDDEN) {
      if (allTexts.includes(word)) {
        ok = assert(false, `"${word}" found in results for "${q}"`) && false;
      }
    }
  }
  if (ok) { passed++; console.log("   ✓ No forbidden words in any search results\n   → PASS\n"); }
  else { failed++; console.log("   → FAIL\n"); }
}

// ─── Summary ─────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════");
console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
if (failed > 0) console.log("  ⚠️  SOME TESTS FAILED — review above");
else console.log("  ✓ ALL TESTS PASS");
console.log("═══════════════════════════════════════════════════");
