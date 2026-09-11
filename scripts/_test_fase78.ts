/**
 * E2E Test script for Research Chat FASE 7-8
 * Simulates the endpoint logic without DB/server.
 * 
 * Run: npx tsx scripts/_test_fase78.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Direct requires to avoid monorepo path issues
const { parseAllReferences } = require("../packages/shared/dist/research-references/index.js");

// Inline the matcher logic (same as precursor-matcher.service.ts but without ESM import issues)
const INDEX = JSON.parse(readFileSync(resolve(__dirname, "../data/precursor-study-index/pt14_S.index.json"), "utf-8"));

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u00A0]/g, " ").replace(/[¿?¡!.,;:()'"\u201C\u201D\u2018\u2019\u00AB\u00BB\[\]]/g, "").replace(/\s+/g, " ").trim();
}
function normalizeRef(raw: string): string {
  return raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/,?\s*(recuadro|nota)\s*$/i, "").replace(/pags?\.?/g, "pag").replace(/parrs?\.?/g, "parr").replace(/\s+/g, " ").trim();
}

function matchPrecursorQuestion(userInput: string) {
  const parsedRefs = require("../packages/shared/dist/research-references/index.js").parseWolReferences(userInput);
  const wolRefs = parsedRefs.filter((r: any) => r.type === "wol");
  for (const inputRef of wolRefs) {
    const inputNorm = normalizeRef(inputRef.raw);
    for (const lesson of INDEX.lessons) {
      for (const extract of lesson.extracts) {
        for (const ref of extract.references) {
          if (normalizeRef(ref.raw) === inputNorm) {
            return { matched: true, confidence: 0.95, matchStrategy: "reference", lesson: { title: lesson.title, lessonKey: lesson.lessonKey, day: lesson.day }, matchedExtract: { caption: extract.caption, articleTitle: ref.articleTitle, paragraphOrdinal: extract.paragraphOrdinal, reference: ref.raw } };
          }
        }
      }
    }
  }
  return { matched: false, confidence: 0, matchStrategy: "none" };
}

// WOL resolver - we use fetch directly  
async function resolveWolRefs(allRefs: any[], userContext: string) {
  // Simplified: just test the logic without the full resolver (which needs ESM)
  const results = [];
  for (const ref of allRefs) {
    if (ref.type === "bible") {
      results.push({ type: "bible", raw: ref.raw, status: "resolved", url: `https://wol.jw.org/es/wol/s/r4/lp-s?q=${encodeURIComponent(ref.raw)}`, title: ref.raw, notes: "Referencia bíblica detectada." });
      continue;
    }
    if (ref.type === "wol") {
      // Validate reference
      if (ref.date) {
        const parts = ref.date.split("/");
        const month = parseInt(parts[1], 10);
        if (month < 1 || month > 12) {
          results.push({ type: "wol", raw: ref.raw, status: "invalid_reference", notes: `Mes inválido: ${month}` });
          continue;
        }
      }
      if (ref.page && ref.page > 500) {
        results.push({ type: "wol", raw: ref.raw, status: "invalid_reference", notes: `Página fuera de rango: ${ref.page}` });
        continue;
      }
      
      // Try WOL lookup
      const isPeriodical = ["w", "g", "wp", "mwb", "km", "yb"].includes(ref.publicationCode.replace(/\d+(\.\d+)?$/, ""));
      const lookupBase = isPeriodical ? "/l/" : "/pl/";
      const searchableRaw = ref.raw.replace(/,?\s*(recuadro|nota)\s*$/i, "").trim();
      const lookupUrl = `https://wol.jw.org/es/wol${lookupBase}r4/lp-s?q=${encodeURIComponent(searchableRaw)}`;
      
      try {
        const response = await fetch(lookupUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept-Language": "es" },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) { results.push({ type: "wol", raw: ref.raw, status: "failed", notes: `HTTP ${response.status}` }); continue; }
        const html = await response.text();
        
        const isArticle = /data-pid=/i.test(html);
        const links = [...new Set((html.match(/\/es\/wol\/d\/r4\/lp-s\/\d+/g) || []))];
        const hasDataPnum = html.includes("data-pnum");
        const target = ref.target || "pages";

        // Extract article URL
        const articleUrl = links.length > 0 ? `https://wol.jw.org${links[0]}` : lookupUrl;
        
        // Extract title
        const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        let title = titleM ? titleM[1].replace(/<[^>]+>/g, "").replace(/&mdash;/g, "—").replace(/\s+/g, " ").trim() : null;
        if (title) title = title.replace(/\s*—\s*BIBLIOTECA EN LÍNEA.*$/i, "").replace(/\s*Búsqueda\s*$/i, "").trim() || null;

        // Try to extract content based on target
        let extractedContent: any[] = [];
        let excerpt = "";

        if (target === "box") {
          const boxMatches = [...html.matchAll(/<div[^>]*class="[^"]*box[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)];
          const asideMatches = [...html.matchAll(/<aside[^>]*>([\s\S]*?)<\/aside>/gi)];
          const boxes = [...boxMatches, ...asideMatches];
          if (boxes.length > 0) {
            for (let i = 0; i < boxes.length; i++) {
              const text = boxes[i][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              if (text.length > 30) extractedContent.push({ label: `Recuadro ${i+1}`, text });
            }
          }
          // If no box found in lookup page, try the article directly
          if (extractedContent.length === 0 && links.length > 0) {
            const artRes = await fetch(articleUrl, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "es" }, signal: AbortSignal.timeout(15000) });
            if (artRes.ok) {
              const artHtml = await artRes.text();
              const artBoxes = [...artHtml.matchAll(/<div[^>]*class="[^"]*box[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)];
              const artAsides = [...artHtml.matchAll(/<aside[^>]*>([\s\S]*?)<\/aside>/gi)];
              for (const b of [...artBoxes, ...artAsides]) {
                const text = b[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                if (text.length > 30) extractedContent.push({ label: `Recuadro`, text });
              }
            }
          }
          if (extractedContent.length === 0) {
            results.push({ type: "wol", raw: ref.raw, status: "unresolved", url: articleUrl, title, notes: "No se encontró un recuadro en el artículo. Pega el link directo o el texto del recuadro." });
            continue;
          }
        } else if (target === "note") {
          // Try to find footnotes in lookup page or article
          const fnMatches = [...html.matchAll(/<div[^>]*class="[^"]*(?:groupFootnote|footnote)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
          if (fnMatches.length > 0) {
            for (let i = 0; i < fnMatches.length; i++) {
              const text = fnMatches[i][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              if (text.length > 10) extractedContent.push({ label: `Nota ${i+1}`, text });
            }
          }
          if (extractedContent.length === 0 && links.length > 0) {
            const artRes = await fetch(articleUrl, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "es" }, signal: AbortSignal.timeout(15000) });
            if (artRes.ok) {
              const artHtml = await artRes.text();
              const artFn = [...artHtml.matchAll(/<div[^>]*class="[^"]*(?:groupFootnote|footnote)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
              for (const f of artFn) {
                const text = f[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                if (text.length > 10) extractedContent.push({ label: `Nota`, text });
              }
            }
          }
          if (extractedContent.length === 0) {
            results.push({ type: "wol", raw: ref.raw, status: "unresolved", url: articleUrl, title, notes: "No se encontró la nota. Pega el texto de la nota." });
            continue;
          }
        } else if (hasDataPnum) {
          // Extract paragraphs
          const pnumRegex = /data-pnum="(\d+)"/g;
          let m;
          while ((m = pnumRegex.exec(html)) !== null) {
            const pNum = parseInt(m[1], 10);
            const idx = m.index;
            const before = html.slice(Math.max(0, idx - 400), idx);
            const pStart = before.lastIndexOf("<p");
            if (pStart >= 0) {
              const fullStart = Math.max(0, idx - 400) + pStart;
              const pEnd = html.indexOf("</p>", idx);
              if (pEnd > 0) {
                let text = html.slice(fullStart, pEnd + 4).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                text = text.replace(new RegExp(`^${pNum}\\s+`), "");
                if (text.length > 10) extractedContent.push({ label: `Párrafo ${pNum}`, paragraphNumber: pNum, text });
              }
            }
          }
        }

        excerpt = extractedContent.map(p => p.text).join(" ").slice(0, 600);
        
        if (extractedContent.length > 0) {
          results.push({ type: "wol", raw: ref.raw, status: "resolved", url: articleUrl, urlType: "direct", title, excerpt, extractedContent, notes: "Referencia resuelta con contenido real." });
        } else {
          results.push({ type: "wol", raw: ref.raw, status: "unresolved", url: articleUrl, title, notes: "Artículo encontrado pero no se pudo extraer contenido específico." });
        }
      } catch (e: any) {
        results.push({ type: "wol", raw: ref.raw, status: "failed", notes: `Error: ${e.message}` });
      }
    }
  }
  return results;
}

async function simulateEndpoint(message: string) {
  console.log("═══════════════════════════════════════════");
  console.log("INPUT:", message);
  console.log("═══════════════════════════════════════════");

  // 1. Parse references
  const { allRefs } = parseAllReferences(message);
  console.log("\n1. PARSED REFERENCES:", allRefs.length);
  for (const r of allRefs) {
    console.log(`   [${r.type}] ${r.raw}${(r as any).target ? ` (target: ${(r as any).target})` : ""}`);
  }

  // 2. Match against Precursor Study Index
  let matchedStudyContext: any = null;
  const precursorMatch = matchPrecursorQuestion(message);
  if (precursorMatch.matched && precursorMatch.confidence >= 0.60) {
    matchedStudyContext = {
      confidence: precursorMatch.confidence,
      matchStrategy: precursorMatch.matchStrategy,
      lesson: precursorMatch.lesson?.title,
      lessonKey: precursorMatch.lesson?.lessonKey,
      day: precursorMatch.lesson?.day,
      extract: precursorMatch.matchedExtract?.caption,
      articleTitle: precursorMatch.matchedExtract?.articleTitle,
      userQuestion: message.replace(/\([^)]*\)/g, "").replace(/https?:\/\/\S+/g, "").trim(),
      source: "pt14_S.index.json",
    };
    console.log("\n2. MATCHED STUDY CONTEXT:");
    console.log(`   Lección: ${matchedStudyContext.lesson}`);
    console.log(`   Día: ${matchedStudyContext.day}`);
    console.log(`   Extracto: ${matchedStudyContext.extract}`);
    console.log(`   Confianza: ${Math.round(matchedStudyContext.confidence * 100)}%`);
    console.log(`   Estrategia: ${matchedStudyContext.matchStrategy}`);
  } else {
    console.log("\n2. NO PRECURSOR MATCH");
  }

  // 3. Resolve references
  console.log("\n3. RESOLVING WOL REFERENCES...");
  const resolvedRefs = await resolveWolRefs(allRefs, message);
  for (const r of resolvedRefs) {
    console.log(`   [${r.type}] ${r.raw} → STATUS: ${r.status}`);
    if (r.title) console.log(`      Title: ${r.title}`);
    if (r.url) console.log(`      URL: ${r.url}`);
    if (r.extractedContent?.length) console.log(`      Extracted: ${r.extractedContent.length} blocks, ${r.extractedContent.reduce((s, p) => s + p.text.length, 0)} chars total`);
    if (r.notes) console.log(`      Notes: ${r.notes}`);
  }

  // 4. Source-gating
  const userTextOnly = message.replace(/\([^)]*\)/g, "").replace(/https?:\/\/\S+/g, "").trim();
  const hasUsableUserText = Boolean(userTextOnly && userTextOnly.length > 100);
  const hasResolvedWolSource = resolvedRefs.some(
    (s) => s.type === "wol" && s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 40
  );
  const hasResolvedBibleSource = resolvedRefs.some(
    (s) => s.type === "bible" && s.status === "resolved"
  );
  const hasAnyUsableSource = hasUsableUserText || hasResolvedWolSource || hasResolvedBibleSource;

  const usedSources = resolvedRefs.filter(
    (s) => (s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 10) || s.type === "bible"
  );
  const detectedButUnusedSources = resolvedRefs.filter(
    (s) => s.status !== "resolved" || (!s.excerpt && s.type !== "bible")
  );

  console.log("\n4. SOURCE-GATING:");
  console.log(`   Has usable user text (>100 chars): ${hasUsableUserText}`);
  console.log(`   Has resolved WOL source: ${hasResolvedWolSource}`);
  console.log(`   Has resolved Bible source: ${hasResolvedBibleSource}`);
  console.log(`   ═══ GATE DECISION: ${hasAnyUsableSource ? "✅ PASS → OpenAI ALLOWED" : "❌ BLOCKED → NO OpenAI"}`);
  console.log(`   Used sources: ${usedSources.length}`);
  console.log(`   Detected but unused: ${detectedButUnusedSources.length}`);

  // 5. Build response structure (mirrors what the real endpoint returns)
  const response: any = {
    matchedStudyContext: matchedStudyContext ? {
      confidence: matchedStudyContext.confidence,
      matchStrategy: matchedStudyContext.matchStrategy,
      lesson: matchedStudyContext.lesson,
      lessonKey: matchedStudyContext.lessonKey,
      day: matchedStudyContext.day,
      extract: matchedStudyContext.extract,
      articleTitle: matchedStudyContext.articleTitle,
      userQuestion: matchedStudyContext.userQuestion,
      source: matchedStudyContext.source,
    } : null,
    usedSources: usedSources.map((s: any) => ({
      reference: s.raw,
      type: s.type,
      status: s.status,
      title: s.title || null,
      publication: s.publication || null,
      url: s.url || null,
      urlType: s.urlType || null,
      target: s.target || null,
      extractedContent: (s.extractedContent || []).map((p: any) => ({
        label: p.label,
        paragraphNumber: p.paragraphNumber || null,
        textLength: p.text.length,
        first120Chars: p.text.slice(0, 120),
        last120Chars: p.text.length > 120 ? p.text.slice(-120) : null,
        highlights: [],
      })),
    })),
    detectedButUnusedSources: detectedButUnusedSources.map((s: any) => ({
      reference: s.raw,
      type: s.type,
      status: s.status,
      target: allRefs.find((r: any) => r.raw === s.raw)?.target || null,
      reason: s.status === "invalid_reference" ? (s.notes || "Referencia inválida")
        : s.status === "unresolved" ? (s.notes || "No se pudo extraer contenido")
        : s.status === "failed" ? (s.notes || "Error al resolver")
        : "Referencia ambigua",
      url: s.url || null,
    })),
    openAiCalled: hasAnyUsableSource,
    comments: hasAnyUsableSource ? "[OpenAI would generate comments here]" : [],
    warnings: hasAnyUsableSource ? [] : ["No se encontraron fuentes usables. No se generaron comentarios."],
  };

  console.log("\n5. RESPONSE (valid JSON via JSON.stringify):");
  console.log(JSON.stringify(response, null, 2));
  console.log("\n");
}

// ─── Run all test cases ──────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  FASE 7-8 E2E TEST — Research Chat Engine   ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Case A: Main question - should resolve
  await simulateEndpoint("¿Qué efecto ha tenido en ti la explicación actualizada sobre el esclavo fiel? (w13 15/7 págs. 20-25).");

  // Case B: Box - should be unresolved
  await simulateEndpoint("w10 15/7 pág. 22, recuadro");

  // Case C: Bible + note - should resolve
  await simulateEndpoint("Mateo 6:9 (w20.06 pág. 7, nota)");

  // Case D: Invalid reference - should block
  await simulateEndpoint("w99 99/99 pág. 999 párr. 99");
}

main().catch(console.error);
