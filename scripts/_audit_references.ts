/**
 * Precursor Reference Gap Audit
 * 
 * Audits all references in pt14_S.index.json against parser + resolver.
 * Generates JSON + Markdown reports of coverage gaps.
 * 
 * Run: npx tsx scripts/_audit_references.ts
 * 
 * Does NOT call OpenAI. Only tests parser detection and WOL resolution.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const { parseAllReferences, parseWolReferences, parseBibleReferences } = require("../packages/shared/dist/research-references/index.js");

// ─── Config ──────────────────────────────────────────────

const INDEX_PATH = resolve(__dirname, "../data/precursor-study-index/pt14_S.index.json");
const REPORT_DIR = resolve(__dirname, "../data/reports");
const JSON_OUT = resolve(REPORT_DIR, "precursor-reference-gap-report.json");
const MD_OUT = resolve(REPORT_DIR, "precursor-reference-gap-report.md");

if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });

const INDEX = JSON.parse(readFileSync(INDEX_PATH, "utf-8"));

// ─── WOL Fetch (limited, with timeout) ──────────────────

const FETCH_TIMEOUT = 12000;
const CONCURRENCY = 2;
let fetchCount = 0;

async function fetchWol(url: string): Promise<{ ok: boolean; html: string } | null> {
  try {
    fetchCount++;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept-Language": "es" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return { ok: false, html: "" };
    return { ok: true, html: await res.text() };
  } catch {
    return null;
  }
}

// ─── Resolve a single reference ──────────────────────────

interface AuditItem {
  id: string;
  day: string;
  lessonKey: string;
  lessonTitle: string;
  paragraphOrdinal: number;
  extractCaption: string;
  questionText: null;
  questionSource: "not_available_in_db";
  referenceRaw: string;
  referenceNormalized: string;
  searchableRaw: string;
  type: string;
  target: string | null;
  parserStatus: "parsed" | "not_detected" | "partial";
  resolverStatus: string;
  extractorStatus: string;
  sourceGating: "usable" | "blocked";
  url: string | null;
  title: string | null;
  publication: string | null;
  contentBlocks: number;
  totalTextLength: number;
  reason: string | null;
  needsManualFallback: boolean;
  manualFallbackSuggestion: string | null;
}

function normalizeForComparison(raw: string): string {
  return raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/pags?\.?/g, "pag").replace(/parrs?\.?/g, "parr").replace(/\s+/g, " ").trim();
}

async function auditReference(
  ref: any, lesson: any, extract: any, idx: number
): Promise<AuditItem> {
  const raw = ref.raw as string;
  const id = `pt14_S-${lesson.lessonKey}-${String(extract.paragraphOrdinal).padStart(3, "0")}-${String(idx + 1).padStart(3, "0")}`;

  // Step 1: Parser
  const parsed = parseAllReferences(raw);
  const wolRefs = parsed.wolRefs || [];
  const bibleRefs = parsed.bibleRefs || [];
  const allParsed = [...wolRefs, ...bibleRefs];

  let parserStatus: "parsed" | "not_detected" | "partial" = "not_detected";
  let type = ref.type || "unknown";
  let target: string | null = null;
  let referenceNormalized = normalizeForComparison(raw);

  if (allParsed.length > 0) {
    parserStatus = "parsed";
    const first = allParsed[0];
    type = first.type || type;
    target = first.target || null;
  } else {
    // Try to detect if it's a partially supported format
    if (/^[a-z]{1,4}\d{0,2}/i.test(raw) || raw.includes("pág") || raw.includes("párr")) {
      parserStatus = "partial";
    }
  }

  // For items the parser can't handle, skip WOL resolution
  if (parserStatus === "not_detected") {
    return {
      id, day: lesson.day, lessonKey: lesson.lessonKey, lessonTitle: lesson.title,
      paragraphOrdinal: extract.paragraphOrdinal, extractCaption: extract.caption,
      questionText: null, questionSource: "not_available_in_db",
      referenceRaw: raw, referenceNormalized, searchableRaw: raw,
      type, target, parserStatus, resolverStatus: "unsupported_format",
      extractorStatus: "not_attempted", sourceGating: "blocked",
      url: null, title: null, publication: null, contentBlocks: 0, totalTextLength: 0,
      reason: "Parser no detectó esta referencia. Formato no soportado o sin código de publicación reconocido.",
      needsManualFallback: true,
      manualFallbackSuggestion: "Proporcionar texto de la referencia manualmente o link directo a JW.org",
    };
  }

  // Step 2: Build WOL URL and resolve
  const searchableRaw = raw.replace(/,?\s*(recuadro|nota)\s*$/i, "").trim();
  let resolverStatus = "unresolved";
  let extractorStatus = "not_attempted";
  let url: string | null = null;
  let title: string | null = null;
  let publication: string | null = null;
  let contentBlocks = 0;
  let totalTextLength = 0;
  let reason: string | null = null;

  if (type === "bible") {
    // Bible references — currently only generate a search URL, not extracted
    resolverStatus = "parsed_only";
    extractorStatus = "not_attempted";
    url = `https://wol.jw.org/es/wol/s/r4/lp-s?q=${encodeURIComponent(raw)}`;
    reason = "Referencia bíblica detectada. BibleWolResolver con extracción de versículos NO implementado aún.";
    return {
      id, day: lesson.day, lessonKey: lesson.lessonKey, lessonTitle: lesson.title,
      paragraphOrdinal: extract.paragraphOrdinal, extractCaption: extract.caption,
      questionText: null, questionSource: "not_available_in_db",
      referenceRaw: raw, referenceNormalized, searchableRaw,
      type, target: "bible", parserStatus, resolverStatus,
      extractorStatus, sourceGating: "usable",
      url, title: raw, publication: "Traducción del Nuevo Mundo", contentBlocks: 0, totalTextLength: 0,
      reason, needsManualFallback: false,
      manualFallbackSuggestion: null,
    };
  }

  // WOL reference — try to resolve
  const pubCode = allParsed[0]?.publicationCode?.replace(/\d+(\.\d+)?$/, "") || "";
  const isPeriodical = ["w", "g", "wp", "mwb", "km", "yb"].includes(pubCode);
  const lookupBase = isPeriodical ? "/l/" : "/pl/";
  const lookupUrl = `https://wol.jw.org/es/wol${lookupBase}r4/lp-s?q=${encodeURIComponent(searchableRaw)}`;

  const fetchResult = await fetchWol(lookupUrl);

  if (!fetchResult) {
    resolverStatus = "unresolved";
    reason = "No se pudo conectar con WOL (timeout o error de red)";
  } else if (!fetchResult.ok) {
    resolverStatus = "unresolved";
    reason = `WOL respondió con error HTTP`;
  } else {
    const html = fetchResult.html;
    const hasDataPnum = html.includes("data-pnum");
    const links = [...new Set((html.match(/\/es\/wol\/d\/r4\/lp-s\/\d+/g) || []))];

    if (links.length > 0) {
      url = `https://wol.jw.org${links[0]}`;
    } else if (hasDataPnum) {
      url = lookupUrl;
    }

    // Extract title
    const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleM) {
      title = titleM[1].replace(/<[^>]+>/g, "").replace(/&mdash;/g, "—").replace(/\s+/g, " ").trim()
        .replace(/\s*—\s*BIBLIOTECA EN LÍNEA.*$/i, "").replace(/Búsqueda\s*$/i, "").trim() || null;
    }

    // Check content based on target
    if (target === "box") {
      // Look for boxes
      const boxCount = (html.match(/boxSupplement|<aside/gi) || []).length;
      if (boxCount > 0) {
        resolverStatus = "resolved";
        extractorStatus = "content_extracted";
        contentBlocks = boxCount;
      } else {
        // Check article directly if we have a link
        if (links.length > 0) {
          const artResult = await fetchWol(url!);
          if (artResult?.ok) {
            const artBoxes = (artResult.html.match(/boxSupplement|<aside/gi) || []).length;
            if (artBoxes > 0) {
              resolverStatus = "resolved";
              extractorStatus = "content_extracted";
              contentBlocks = artBoxes;
            } else {
              resolverStatus = "unresolved";
              extractorStatus = "extraction_failed";
              reason = "Artículo encontrado, pero no se encontró bloque tipo recuadro en el HTML.";
            }
          }
        } else {
          resolverStatus = "unresolved";
          extractorStatus = "extraction_failed";
          reason = "No se encontró recuadro en la página devuelta por WOL.";
        }
      }
    } else if (target === "note") {
      // Look for notes
      const noteCount = (html.match(/groupFootnote|class="[^"]*footnote/gi) || []).length;
      if (noteCount > 0) {
        resolverStatus = "resolved";
        extractorStatus = "content_extracted";
        contentBlocks = noteCount;
      } else if (links.length > 0) {
        const artResult = await fetchWol(url!);
        if (artResult?.ok) {
          const artNotes = (artResult.html.match(/groupFootnote|class="[^"]*footnote/gi) || []).length;
          if (artNotes > 0) {
            resolverStatus = "resolved";
            extractorStatus = "content_extracted";
            contentBlocks = artNotes;
          } else {
            resolverStatus = "unresolved";
            extractorStatus = "extraction_failed";
            reason = "Artículo encontrado, pero no se encontró nota/footnote en el HTML.";
          }
        }
      } else {
        resolverStatus = "unresolved";
        extractorStatus = "extraction_failed";
        reason = "No se encontró nota en la página devuelta por WOL.";
      }
    } else if (hasDataPnum) {
      // Has paragraphs — count them
      const pnums = (html.match(/data-pnum="\d+"/g) || []);
      contentBlocks = pnums.length;
      if (contentBlocks > 0) {
        resolverStatus = "resolved";
        extractorStatus = "content_extracted";
        // Estimate text length (avg ~500 chars per paragraph)
        totalTextLength = contentBlocks * 500;
      } else {
        resolverStatus = "unresolved";
        reason = "Página con data-pid pero sin data-pnum (párrafos no enumerados).";
      }
    } else if (links.length > 0) {
      // Got article link but no content on lookup page — need to open article
      resolverStatus = "resolved";
      extractorStatus = "content_available";
      reason = "Artículo encontrado vía link. Contenido disponible al abrir artículo.";
    } else {
      resolverStatus = "unresolved";
      reason = "WOL no devolvió artículo ni párrafos para esta referencia.";
    }
  }

  const needsManualFallback = resolverStatus !== "resolved" && resolverStatus !== "parsed_only";
  let manualFallbackSuggestion: string | null = null;
  if (needsManualFallback) {
    if (target === "box") manualFallbackSuggestion = "Proporcionar texto del recuadro o URL directa al recuadro en JW.org";
    else if (target === "note") manualFallbackSuggestion = "Proporcionar texto de la nota o URL directa";
    else manualFallbackSuggestion = "Proporcionar link directo a JW.org o pegar el texto de la fuente";
  }

  return {
    id, day: lesson.day, lessonKey: lesson.lessonKey, lessonTitle: lesson.title,
    paragraphOrdinal: extract.paragraphOrdinal, extractCaption: extract.caption,
    questionText: null, questionSource: "not_available_in_db",
    referenceRaw: raw, referenceNormalized, searchableRaw,
    type, target, parserStatus, resolverStatus,
    extractorStatus, sourceGating: resolverStatus === "resolved" ? "usable" : "blocked",
    url, title, publication, contentBlocks, totalTextLength,
    reason, needsManualFallback, manualFallbackSuggestion,
  };
}

// ─── Parser-only audit for format support ────────────────

function auditFormats(): any[] {
  const inputs = [
    // Revistas formato corto
    "w13 15/7 págs. 20-25", "w15 15/12 pág. 8 párrs. 16, 17",
    "w20.06 pág. 7, nota", "w10 15/7 pág. 22, recuadro",
    // Revistas formato largo
    "La Atalaya del 15 de julio de 2013, páginas 20 a 25",
    "La Atalaya de estudio de junio de 2020, página 7, nota",
    "La Atalaya, 15 de diciembre de 2015, página 8, párrafos 16 y 17",
    // Libros
    "cl cap. 1 párr. 5", "bt cap. 3 párrs. 7-9", "rr cap. 10 párr. 4",
    "lff lección 7 punto 3", "od cap. 5 párr. 12", "jy cap. 17",
    // Biblia
    "Mateo 6:9", "1 Pedro 1:10-12", "2 Timoteo 3:16, 17",
    "Gálatas 5:22, 23", "Sal. 83:18", "Rev. 21:3, 4",
    "Apoc. 21:3, 4", "Revelación 21:3, 4",
    // Apéndices
    "Apéndice A4", "Apéndice B12", 'Glosario, "alma"',
    "nota de estudio de Mateo 6:9", "nwtsty nota de estudio Mateo 6:9",
    // Mezcladas
    "Vea w13 15/7 págs. 20-25", "Compare con w20.06 pág. 7",
    "Consulte el recuadro de w10 15/7 pág. 22",
    "Mateo 6:9 y w20.06 pág. 7, nota",
  ];

  return inputs.map((input) => {
    const { allRefs, bibleRefs, wolRefs } = parseAllReferences(input);
    const detected = allRefs.length > 0;
    const parsed = allRefs.map((r: any) => ({
      type: r.type, raw: r.raw, target: r.target || null,
      pubCode: r.publicationCode || null, page: r.page || null,
    }));
    let target = "unknown";
    if (parsed.length > 0) target = parsed[0].target || (parsed[0].type === "bible" ? "bible" : "pages");

    let status = "unsupported_format";
    let reason = "Formato no soportado por el parser";
    if (detected) {
      status = "parsed";
      reason = null as any;
      if (wolRefs.length > 0 && wolRefs[0].target === "box") { status = "parsed"; reason = "Recuadro: resolución depende de WOL"; }
      if (wolRefs.length > 0 && wolRefs[0].target === "note") { status = "parsed"; reason = "Nota: resolución depende de WOL"; }
    }

    return { input, detected, parsed, target, canResolve: detected, status, reason };
  });
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Precursor Reference Gap Audit              ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const items: AuditItem[] = [];
  let totalRefs = 0;

  // Process all lessons
  for (const lesson of INDEX.lessons) {
    for (const extract of lesson.extracts) {
      for (let i = 0; i < extract.references.length; i++) {
        totalRefs++;
        const ref = extract.references[i];
        process.stdout.write(`\r  Auditing ${totalRefs}...`);
        const item = await auditReference(ref, lesson, extract, i);
        items.push(item);
        // Rate limiting: small delay between WOL calls
        if (fetchCount % 5 === 0) await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  console.log(`\r  Audited ${totalRefs} references. WOL fetches: ${fetchCount}`);

  // Summary
  const summary = {
    totalLessons: INDEX.lessons.length,
    totalReferences: items.length,
    resolved: items.filter(i => i.resolverStatus === "resolved").length,
    parsedOnly: items.filter(i => i.resolverStatus === "parsed_only").length,
    detectedButUnresolved: items.filter(i => i.resolverStatus === "unresolved").length,
    ambiguous: items.filter(i => i.resolverStatus === "ambiguous").length,
    invalid: items.filter(i => i.resolverStatus === "invalid_reference").length,
    unsupported: items.filter(i => i.resolverStatus === "unsupported_format").length,
    extractionFailed: items.filter(i => i.extractorStatus === "extraction_failed").length,
    needsManualFallback: items.filter(i => i.needsManualFallback).length,
  };

  console.log("\n═══ SUMMARY ═══");
  console.log(`Total references: ${summary.totalReferences}`);
  console.log(`Resolved: ${summary.resolved}`);
  console.log(`Parsed only (Bible): ${summary.parsedOnly}`);
  console.log(`Unresolved: ${summary.detectedButUnresolved}`);
  console.log(`Unsupported format: ${summary.unsupported}`);
  console.log(`Extraction failed: ${summary.extractionFailed}`);
  console.log(`Needs manual fallback: ${summary.needsManualFallback}`);

  // Format audit
  console.log("\n═══ FORMAT SUPPORT AUDIT ═══");
  const formats = auditFormats();
  for (const f of formats) {
    const icon = f.detected ? "✅" : "❌";
    console.log(`  ${icon} ${f.input} → ${f.status}${f.reason ? ` (${f.reason})` : ""}`);
  }

  // Write JSON
  const report = {
    generatedAt: new Date().toISOString(),
    sourceIndex: "data/precursor-study-index/pt14_S.index.json",
    summary,
    formatSupport: formats,
    items,
  };
  writeFileSync(JSON_OUT, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n✅ JSON report: ${JSON_OUT}`);

  // Write Markdown
  const md = generateMarkdown(report);
  writeFileSync(MD_OUT, md, "utf-8");
  console.log(`✅ Markdown report: ${MD_OUT}`);

  // Top 20 problematic
  console.log("\n═══ TOP 20 PROBLEMATIC REFERENCES ═══");
  const problematic = items.filter(i => i.needsManualFallback).slice(0, 20);
  for (const p of problematic) {
    console.log(`  ${p.lessonKey} | ${p.referenceRaw} | ${p.resolverStatus} | ${p.reason?.slice(0, 60)}`);
  }
}

function generateMarkdown(report: any): string {
  const { summary, items, formatSupport } = report;
  let md = `# Precursor Reference Gap Report\n\n`;
  md += `Generated: ${report.generatedAt}\n`;
  md += `Source: ${report.sourceIndex}\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|---|---|\n`;
  md += `| Total references | ${summary.totalReferences} |\n`;
  md += `| ✅ Resolved | ${summary.resolved} |\n`;
  md += `| 📖 Bible (parsed only) | ${summary.parsedOnly} |\n`;
  md += `| ❌ Unresolved | ${summary.detectedButUnresolved} |\n`;
  md += `| ⚠️ Unsupported format | ${summary.unsupported} |\n`;
  md += `| 🔧 Extraction failed | ${summary.extractionFailed} |\n`;
  md += `| 📋 Needs manual fallback | ${summary.needsManualFallback} |\n\n`;

  // A. Resolved
  md += `## A. Referencias listas para usar (${summary.resolved})\n\n`;
  const resolved = items.filter((i: any) => i.resolverStatus === "resolved");
  if (resolved.length > 0) {
    md += `| Día | Lección | Referencia | Target | Bloques | URL |\n|---|---|---|---|---|---|\n`;
    for (const r of resolved.slice(0, 50)) {
      md += `| ${r.day} | ${r.lessonKey} | ${r.referenceRaw} | ${r.target || "-"} | ${r.contentBlocks} | ${r.url ? `[link](${r.url})` : "-"} |\n`;
    }
    if (resolved.length > 50) md += `\n_... y ${resolved.length - 50} más_\n`;
  }
  md += `\n`;

  // B. Unresolved
  md += `## B. Detectadas pero no resueltas (${summary.detectedButUnresolved})\n\n`;
  const unresolved = items.filter((i: any) => i.resolverStatus === "unresolved");
  if (unresolved.length > 0) {
    md += `| Día | Lección | Extracto | Referencia | Target | Motivo | Qué debo proporcionar |\n|---|---|---|---|---|---|---|\n`;
    for (const r of unresolved) {
      md += `| ${r.day} | ${r.lessonKey} | ${r.extractCaption.slice(0, 50)} | ${r.referenceRaw} | ${r.target || "-"} | ${(r.reason || "").slice(0, 60)} | ${r.manualFallbackSuggestion || "-"} |\n`;
    }
  }
  md += `\n`;

  // C. Extraction failed
  const exFailed = items.filter((i: any) => i.extractorStatus === "extraction_failed");
  md += `## C. Extracción fallida — recuadros/notas (${exFailed.length})\n\n`;
  if (exFailed.length > 0) {
    md += `| Día | Lección | Referencia | Target | Motivo | URL |\n|---|---|---|---|---|---|\n`;
    for (const r of exFailed) {
      md += `| ${r.day} | ${r.lessonKey} | ${r.referenceRaw} | ${r.target || "-"} | ${(r.reason || "").slice(0, 80)} | ${r.url ? `[link](${r.url})` : "-"} |\n`;
    }
  }
  md += `\n`;

  // D. Bible references
  const bibles = items.filter((i: any) => i.type === "bible");
  md += `## D. Referencias bíblicas (${bibles.length}) — BibleWolResolver pendiente\n\n`;
  if (bibles.length > 0) {
    md += `| Día | Lección | Referencia | Estado |\n|---|---|---|---|\n`;
    for (const r of bibles.slice(0, 30)) {
      md += `| ${r.day} | ${r.lessonKey} | ${r.referenceRaw} | ${r.resolverStatus} |\n`;
    }
    if (bibles.length > 30) md += `\n_... y ${bibles.length - 30} más_\n`;
  }
  md += `\n`;

  // E. Unsupported formats
  const unsupported = items.filter((i: any) => i.resolverStatus === "unsupported_format");
  md += `## E. Formatos no soportados (${unsupported.length})\n\n`;
  if (unsupported.length > 0) {
    md += `| Día | Lección | Referencia | Motivo |\n|---|---|---|---|\n`;
    for (const r of unsupported) {
      md += `| ${r.day} | ${r.lessonKey} | ${r.referenceRaw} | ${(r.reason || "").slice(0, 80)} |\n`;
    }
  }
  md += `\n`;

  // F. Format support matrix
  md += `## F. Matriz de soporte de formatos\n\n`;
  md += `| Input | Detectado | Status | Motivo |\n|---|---|---|---|\n`;
  for (const f of formatSupport) {
    md += `| ${f.input} | ${f.detected ? "✅" : "❌"} | ${f.status} | ${f.reason || "-"} |\n`;
  }
  md += `\n`;

  // G. Manual fallback list by lesson
  md += `## G. Lista por lección — requieren investigación manual\n\n`;
  const byLesson = new Map<string, any[]>();
  for (const item of items.filter((i: any) => i.needsManualFallback)) {
    const key = item.lessonKey;
    if (!byLesson.has(key)) byLesson.set(key, []);
    byLesson.get(key)!.push(item);
  }
  for (const [lessonKey, lessonItems] of byLesson) {
    const first = lessonItems[0];
    md += `### ${first.lessonTitle} (${first.day})\n\n`;
    md += `| Referencia | Target | Estado | Motivo | Qué proporcionar |\n|---|---|---|---|---|\n`;
    for (const r of lessonItems) {
      md += `| ${r.referenceRaw} | ${r.target || "-"} | ${r.resolverStatus} | ${(r.reason || "").slice(0, 60)} | ${r.manualFallbackSuggestion || "-"} |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n_Generado automáticamente. No editar manualmente._\n`;
  return md;
}

main().catch(console.error);
