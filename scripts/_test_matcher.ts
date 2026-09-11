/**
 * Test script for PrecursorQuestionMatcher
 * Run: npx tsx scripts/_test_matcher.ts
 */

// We can't easily import ESM from tsx in CJS mode, so we'll replicate the logic inline for testing
import { readFileSync } from "fs";
import { resolve } from "path";
const { parseWolReferences } = require("../packages/shared/dist/research-references/index.js");

const INDEX = JSON.parse(readFileSync(resolve(__dirname, "../data/precursor-study-index/pt14_S.index.json"), "utf-8"));

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u00A0]/g, " ").replace(/[¿?¡!.,;:()'"\u201C\u201D\u2018\u2019\u00AB\u00BB\[\]]/g, "").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter(t => t.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function normalizeRef(raw: string): string {
  return raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/pags?\.?/g, "pag").replace(/parrs?\.?/g, "parr").replace(/\s+/g, " ").trim();
}

function match(userInput: string) {
  const parsedRefs = parseWolReferences(userInput);
  const wolRefs = parsedRefs.filter(r => r.type === "wol") as any[];
  
  // Reference match
  for (const inputRef of wolRefs) {
    const inputNorm = normalizeRef(inputRef.raw);
    for (const lesson of INDEX.lessons) {
      for (const extract of lesson.extracts) {
        for (const ref of extract.references) {
          const refNorm = normalizeRef(ref.raw);
          if (inputNorm === refNorm) {
            return { confidence: 0.95, lesson: lesson.title, extract: extract.caption, strategy: "reference-exact" };
          }
        }
      }
    }
  }
  
  // Text match
  const inputTokens = tokenize(userInput);
  let best: any = null;
  for (const lesson of INDEX.lessons) {
    for (const extract of lesson.extracts) {
      for (const ref of extract.references) {
        if (ref.articleTitle) {
          const score = jaccard(inputTokens, tokenize(ref.articleTitle));
          if (score >= 0.4) {
            const confidence = Math.min(0.85, 0.60 + score * 0.35);
            if (!best || confidence > best.confidence) {
              best = { score, confidence, lesson: lesson.title, extract: extract.caption, strategy: "text-title" };
            }
          }
        }
      }
    }
  }
  
  return best || { confidence: 0, strategy: "none" };
}

// ─── Tests ───────────────────────────────────────────────

const tests = [
  "¿Qué efecto ha tenido en ti la explicación actualizada sobre el esclavo fiel? (w13 15/7 págs. 20-25).",
  "Que efecto tuvo en mi explicacion actualizada esclavo fiel w13 15/7 pags 20 25",
  "w10 15/7 pág. 22, recuadro",
  "kr págs. 110-114",
  "w99 99/99 pág. 999 párr. 99",
  "esclavo fiel y discreto",
];

console.log("═══ PRECURSOR MATCHER TESTS ═══\n");
for (const input of tests) {
  console.log("INPUT:", input);
  const result = match(input);
  console.log("RESULT:", JSON.stringify(result, null, 2));
  console.log();
}
