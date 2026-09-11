/**
 * Test: Manual fallback integration for w15 15/5 pág. 29-pág. 30
 *
 * Validates:
 * - status === "verified"
 * - sourceOrigin === "manual_user_verified"
 * - contentBlocks[0].text does NOT contain "placeholder"
 * - textLength > 3000
 * - Text starts with "PREGUNTAS DE LOS LECTORES"
 * - Contains exact phrases from the real article
 * - Source-gating accepts it as usedSource
 *
 * Run: npx tsx scripts/_test_manual_fallback.ts
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { resolveReferences } from "../apps/api/src/services/research-chat/wol-resolver.service.js";
import { parseAllReferences } from "../packages/shared/src/research-references/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Test helpers ────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) { passed++; console.log(`  ✅ ${message}`); }
  else { failed++; console.log(`  ❌ ${message}`); }
}

function section(title: string) { console.log(`\n── ${title} ──`); }

// ─── Load fallback JSON directly ─────────────────────────

section("A) Validación directa del archivo JSON");

const fallbackPath = resolve(__dirname, "../data/manual-fallbacks/precursor-manual-fallbacks.json");
const fallbacks = JSON.parse(readFileSync(fallbackPath, "utf8"));
const entry = fallbacks[0];

assert(entry.status === "verified", `status === "verified" (got: ${entry.status})`);
assert(entry.sourceOrigin === "manual_user_verified", `sourceOrigin === "manual_user_verified" (got: ${entry.sourceOrigin})`);
assert(entry.verificationMethod === "exact_user_provided_text", `verificationMethod === "exact_user_provided_text"`);

const text = entry.contentBlocks[0].text;
const textLength = text.length;

assert(!text.toLowerCase().includes("placeholder"), "text does NOT contain 'placeholder'");
assert(textLength > 3000, `textLength > 3000 (got: ${textLength})`);
assert(entry.contentBlocks[0].textLength === textLength, `recorded textLength matches actual (${entry.contentBlocks[0].textLength} === ${textLength})`);

// Content hash verification
const computedHash = createHash("sha256").update(text, "utf8").digest("hex");
assert(entry.contentHash === computedHash, `contentHash matches SHA256 (${computedHash.substring(0, 16)}...)`);

section("B) Validación de contenido exacto");

assert(text.startsWith("PREGUNTAS DE LOS LECTORES"), `text starts with "PREGUNTAS DE LOS LECTORES"`);
assert(text.includes("¿Quién es el Gog de Magog del que habla el libro de Ezequiel?"), `contains title question`);
assert(text.includes("Gog de Magog no es"), `contains "Gog de Magog no es"`);
assert(text.includes("una coalición, o grupo, de naciones"), `contains EXACT phrase "una coalición, o grupo, de naciones"`);
assert(text.includes("Rev. 7:14-17"), `contains "Rev. 7:14-17"`);
assert(text.includes("Rev. 20:1, 2"), `contains "Rev. 20:1, 2"`);
assert(text.includes("Ezeq. 39:4"), `contains "Ezeq. 39:4"`);
assert(text.includes("Dan. 11:44, 45"), `contains "Dan. 11:44, 45"`);
assert(text.endsWith("(Rev. 7:14-17)."), `text ends with "(Rev. 7:14-17)."`);

section("C) Integración con el resolver (source-gating)");

async function testResolver() {
  // Disable WOL to test only local/fallback
  process.env.RESEARCH_CHAT_WOL_ENABLED = "false";

  const { allRefs } = parseAllReferences("w15 15/5 pág. 29-pág. 30");
  const results = await resolveReferences(allRefs);
  const r = results[0];

  assert(r?.status === "resolved", `resolver status === "resolved" (got: ${r?.status})`);
  assert((r as any)?.sourceOrigin === "manual_user_verified", `resolver sourceOrigin === "manual_user_verified"`);
  assert(r?.title === "¿Quién es el Gog de Magog del que habla el libro de Ezequiel?", `resolver title is article title`);
  assert(r?.publication === "La Atalaya, 15 de mayo de 2015", `resolver publication correct`);
  assert((r?.excerpt?.length || 0) > 100, `resolver excerpt has real content (${r?.excerpt?.length} chars)`);
  assert((r?.extractedContent?.length || 0) > 0, `resolver extractedContent has blocks`);
  assert(r?.extractedContent?.[0]?.text?.includes("una coalición, o grupo, de naciones") === true, `resolver text includes exact phrase`);

  // Source-gating check
  const hasExcerpt = (r?.excerpt?.trim()?.length || 0) > 10;
  const isResolved = r?.status === "resolved";
  assert(hasExcerpt && isResolved, "source-gating: would be usedSource (resolved + excerpt > 10)");

  // Would OpenAI get real content?
  assert(r?.extractedContent?.[0]?.text?.length === textLength, `OpenAI would receive full text (${r?.extractedContent?.[0]?.text?.length} chars)`);
}

testResolver().then(() => {
  // ─── Summary ─────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`RESULTADOS: ${passed} pasaron, ${failed} fallaron, ${passed + failed} total`);
  if (failed === 0) {
    console.log("✅ TODOS LOS TESTS PASARON — FALLBACK VERIFICADO");
  } else {
    console.log("❌ HAY TESTS FALLIDOS — FALLBACK NO VÁLIDO");
    console.log("⚠️  El fallback debe tener status 'pending_manual_verification'");
    process.exit(1);
  }
}).catch(e => { console.error(e); process.exit(1); });
