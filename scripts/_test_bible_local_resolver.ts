/**
 * Test: BibleLocalResolver
 *
 * Verifies that the local Bible resolver correctly resolves verses
 * from data/bible/nwt_S.json without any network calls.
 *
 * Run: npx tsx scripts/_test_bible_local_resolver.ts
 */

import { resolveFromLocal } from "../apps/api/src/services/research-chat/bible-local-resolver.service.js";

// ─── Test helpers ────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

function section(title: string) {
  console.log(`\n── ${title} ──`);
}

// ─── Test A: Juan 17:3 ───────────────────────────────────

section("A) Juan 17:3 — versículo único");
{
  const result = resolveFromLocal("Juan", 17, "3", "Juan 17:3");
  assert(result.status === "resolved", `status = resolved (got: ${result.status})`);
  assert(result.sourceOrigin === "local_bible", `sourceOrigin = local_bible (got: ${result.sourceOrigin})`);
  assert(result.extractedContent.length === 1, `extractedContent.length = 1 (got: ${result.extractedContent.length})`);
  assert(result.extractedContent[0]?.text.includes("vida eterna"), `text includes "vida eterna"`);
  assert(result.extractedContent[0]?.text.includes("Jesucristo"), `text includes "Jesucristo"`);
  assert(result.bookNumber === 43, `bookNumber = 43 (got: ${result.bookNumber})`);
  assert(result.url === "https://wol.jw.org/es/wol/b/r4/lp-s/nwt/43/17", `url is direct WOL link`);
  assert(result.excerpt.length > 20, `excerpt has real content (length: ${result.excerpt.length})`);
  console.log(`    Texto: "${result.extractedContent[0]?.text.substring(0, 80)}..."`);
}

// ─── Test B: Mateo 6:9 ──────────────────────────────────

section("B) Mateo 6:9 — versículo único");
{
  const result = resolveFromLocal("Mateo", 6, "9", "Mateo 6:9");
  assert(result.status === "resolved", `status = resolved (got: ${result.status})`);
  assert(result.sourceOrigin === "local_bible", `sourceOrigin = local_bible`);
  assert(result.extractedContent.length === 1, `extractedContent.length = 1`);
  assert(result.extractedContent[0]?.text.includes("orar"), `text includes "orar"`);
  assert(result.bookNumber === 40, `bookNumber = 40 (Mateo)`);
  assert(result.url === "https://wol.jw.org/es/wol/b/r4/lp-s/nwt/40/6", `url correct`);
  console.log(`    Texto: "${result.extractedContent[0]?.text.substring(0, 80)}..."`);
}

// ─── Test C: 2 Timoteo 3:16, 17 — múltiples versículos ──

section("C) 2 Timoteo 3:16, 17 — versículos separados por coma");
{
  const result = resolveFromLocal("2 Timoteo", 3, "16, 17", "2 Timoteo 3:16, 17");
  assert(result.status === "resolved", `status = resolved (got: ${result.status})`);
  assert(result.sourceOrigin === "local_bible", `sourceOrigin = local_bible`);
  assert(result.extractedContent.length === 2, `extractedContent.length = 2 (got: ${result.extractedContent.length})`);
  assert(result.extractedContent[0]?.paragraphNumber === 16, `first verse = 16`);
  assert(result.extractedContent[1]?.paragraphNumber === 17, `second verse = 17`);
  assert(result.extractedContent[0]?.text.includes("inspirada"), `v16 includes "inspirada"`);
  assert(result.extractedContent[1]?.text.includes("capacitado"), `v17 includes "capacitado"`);
  assert(result.bookNumber === 55, `bookNumber = 55 (2 Timoteo)`);
  console.log(`    v16: "${result.extractedContent[0]?.text.substring(0, 60)}..."`);
  console.log(`    v17: "${result.extractedContent[1]?.text.substring(0, 60)}..."`);
}

// ─── Test D: Revelación 21:3, 4 — múltiples versículos ──

section("D) Revelación 21:3, 4 — versículos separados por coma");
{
  const result = resolveFromLocal("Revelación", 21, "3, 4", "Revelación 21:3, 4");
  assert(result.status === "resolved", `status = resolved (got: ${result.status})`);
  assert(result.sourceOrigin === "local_bible", `sourceOrigin = local_bible`);
  assert(result.extractedContent.length === 2, `extractedContent.length = 2 (got: ${result.extractedContent.length})`);
  assert(result.extractedContent[0]?.paragraphNumber === 3, `first verse = 3`);
  assert(result.extractedContent[1]?.paragraphNumber === 4, `second verse = 4`);
  assert(result.extractedContent[0]?.text.includes("tienda de Dios"), `v3 includes "tienda de Dios"`);
  assert(result.extractedContent[1]?.text.includes("muerte ya no existirá"), `v4 includes "muerte ya no existirá"`);
  assert(result.bookNumber === 66, `bookNumber = 66 (Revelación)`);
  console.log(`    v3: "${result.extractedContent[0]?.text.substring(0, 60)}..."`);
  console.log(`    v4: "${result.extractedContent[1]?.text.substring(0, 60)}..."`);
}

// ─── Test E: Salmos 83:18 (book name from parser is "Salmos") ──

section("E) Salmos 83:18 — nombre normalizado a Salmos");
{
  // The parser normalizes "Sal." → "Salmos" before calling the resolver
  const result = resolveFromLocal("Salmos", 83, "18", "Sal. 83:18");
  assert(result.status === "resolved", `status = resolved (got: ${result.status})`);
  assert(result.sourceOrigin === "local_bible", `sourceOrigin = local_bible`);
  assert(result.extractedContent.length === 1, `extractedContent.length = 1`);
  assert(result.extractedContent[0]?.text.includes("Jehová"), `text includes "Jehová"`);
  assert(result.extractedContent[0]?.text.includes("Altísimo"), `text includes "Altísimo"`);
  assert(result.bookNumber === 19, `bookNumber = 19 (Salmos)`);
  console.log(`    Texto: "${result.extractedContent[0]?.text.substring(0, 80)}..."`);
}

// ─── Test F: Mateo 99:99 — referencia inexistente ────────

section("F) Mateo 99:99 — capítulo inexistente");
{
  const result = resolveFromLocal("Mateo", 99, "99", "Mateo 99:99");
  assert(result.status === "extraction_failed", `status = extraction_failed (got: ${result.status})`);
  assert(result.sourceOrigin === "none", `sourceOrigin = none (got: ${result.sourceOrigin})`);
  assert(result.extractedContent.length === 0, `extractedContent.length = 0`);
  assert(result.excerpt === "", `excerpt is empty`);
  assert(result.notes?.includes("Capítulo 99 no encontrado") === true, `notes explain failure`);
  console.log(`    Notes: "${result.notes}"`);
}

// ─── Test G: Libro inexistente ───────────────────────────

section("G) LibroFalso 1:1 — libro no mapeado");
{
  const result = resolveFromLocal("LibroFalso", 1, "1", "LibroFalso 1:1");
  assert(result.status === "extraction_failed", `status = extraction_failed (got: ${result.status})`);
  assert(result.sourceOrigin === "none", `sourceOrigin = none`);
  assert(result.extractedContent.length === 0, `extractedContent.length = 0`);
  assert(result.notes?.includes("no mapeado") === true, `notes explain unmapped book`);
  console.log(`    Notes: "${result.notes}"`);
}

// ─── Test H: Génesis 1:1 — primer versículo ─────────────

section("H) Génesis 1:1 — primer versículo de la Biblia");
{
  const result = resolveFromLocal("Génesis", 1, "1", "Génesis 1:1");
  assert(result.status === "resolved", `status = resolved`);
  assert(result.sourceOrigin === "local_bible", `sourceOrigin = local_bible`);
  assert(result.extractedContent[0]?.text.includes("En el principio"), `text starts with "En el principio"`);
  assert(result.bookNumber === 1, `bookNumber = 1`);
  console.log(`    Texto: "${result.extractedContent[0]?.text}"`);
}

// ─── Test I: Rango de versículos ─────────────────────────

section("I) Proverbios 3:5-7 — rango con guión");
{
  const result = resolveFromLocal("Proverbios", 3, "5-7", "Proverbios 3:5-7");
  assert(result.status === "resolved", `status = resolved`);
  assert(result.extractedContent.length === 3, `extractedContent.length = 3 (verses 5,6,7) (got: ${result.extractedContent.length})`);
  assert(result.extractedContent[0]?.paragraphNumber === 5, `first = v5`);
  assert(result.extractedContent[1]?.paragraphNumber === 6, `second = v6`);
  assert(result.extractedContent[2]?.paragraphNumber === 7, `third = v7`);
  console.log(`    v5: "${result.extractedContent[0]?.text.substring(0, 50)}..."`);
}

// ─── Summary ─────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);
console.log(`RESULTADOS: ${passed} pasaron, ${failed} fallaron, ${passed + failed} total`);
if (failed === 0) {
  console.log("✅ TODOS LOS TESTS PASARON");
} else {
  console.log("❌ HAY TESTS FALLIDOS");
  process.exit(1);
}
