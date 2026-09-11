/**
 * PrecursorQuestionMatcher – matches user input to a lesson/extract
 * in the precursor study index via reference or text similarity.
 *
 * ponytail: one file, no class, direct JSON import, Jaccard for text.
 */

import { parseWolReferences } from "@jw-reminders/shared";
import type { WolReference } from "@jw-reminders/shared";
import { createRequire } from "node:module";

// ─── Types ───────────────────────────────────────────────

export interface PrecursorMatchResult {
  matched: boolean;
  confidence: number;
  lesson?: {
    lessonKey: string;
    title: string;
    day: string;
  };
  matchedExtract?: {
    paragraphOrdinal: number;
    caption: string;
    reference: string;
    articleTitle?: string;
  };
  matchStrategy: "reference" | "text" | "none";
}

// ─── Index types (mirrors JSON shape) ────────────────────

interface IndexReference {
  raw: string;
  type: string;
  articleTitle?: string;
  publicationSymbol?: string;
  year?: number;
  issueTag?: string;
  mepsDocumentId?: number;
  refParagraphs?: string;
  link?: string;
}

interface IndexExtract {
  paragraphOrdinal: number;
  caption: string;
  references: IndexReference[];
}

interface IndexLesson {
  lessonKey: string;
  title: string;
  day: string;
  extracts: IndexExtract[];
}

interface IndexFile {
  publication: { key: string; title: string; totalLessons: number };
  lessons: IndexLesson[];
}

// ─── Load index (cached at module level) ─────────────────

const require = createRequire(import.meta.url);
const INDEX: IndexFile = require("../../../../../data/precursor-study-index/pt14_S.index.json");

// ─── Normalization ───────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[\u00A0]/g, " ") // non-breaking space → normal space
    .replace(/[¿?¡!.,;:()'"\u201C\u201D\u2018\u2019\u00AB\u00BB\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): Set<string> {
  const n = normalize(text);
  return new Set(n.split(" ").filter((t) => t.length > 1));
}

/** Jaccard similarity between two token sets. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

// ─── Normalize reference strings for comparison ──────────

function normalizeRef(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/,?\s*(recuadro|nota)\s*$/i, "") // strip target suffixes for matching
    .replace(/pags?\.?/g, "pag")
    .replace(/parrs?\.?/g, "parr")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrae los números de página de un raw indexado tipo "cf págs. 133-134". */
function extractPageNumbers(raw: string): number[] {
  const m = raw.match(/p[aá]gs?\.?\s*(\d+(?:\s*[-–,]\s*\d+)*)/i);
  if (!m) return [];
  return m[1]
    .split(/[-–,]/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

// ─── Reference matching ──────────────────────────────────

function tryReferenceMatch(
  parsedRefs: (WolReference | { type: "wol_link" })[],
): { confidence: number; lesson: IndexLesson; extract: IndexExtract; ref: IndexReference } | null {
  const wolRefs = parsedRefs.filter((r): r is WolReference => r.type === "wol");
  if (wolRefs.length === 0) return null;

  let best: { confidence: number; lesson: IndexLesson; extract: IndexExtract; ref: IndexReference } | null = null;

  for (const inputRef of wolRefs) {
    const inputNorm = normalizeRef(inputRef.raw);
    const inputPubBase = inputRef.publicationCode.replace(/\d{2}(\.\d{2})?$/, ""); // "w13" → base "w"
    const inputYear = inputRef.publicationCode.match(/(\d{2})/)?.[1] ?? "";

    for (const lesson of INDEX.lessons) {
      for (const extract of lesson.extracts) {
        for (const ref of extract.references) {
          if (ref.type !== "wol") continue;

          const refNorm = normalizeRef(ref.raw);

          // Exact normalized match
          if (inputNorm === refNorm) {
            return { confidence: 0.95, lesson, extract, ref };
          }

          // Partial match: same publication symbol, disambiguating by year when
          // the code lleva año embebido (ej. "w13"), o por página cuando no
          // (ej. "cf", "kr", "od" — libros sin fecha, donde "" === "" siempre
          // matchearía cualquier cita del mismo libro sin distinguir cuál).
          const refSymbol = (ref.publicationSymbol ?? "").toLowerCase();
          const refYear = String(ref.year ?? "").slice(-2);
          const sameSymbol = Boolean(refSymbol) && inputPubBase === refSymbol.replace(/[-\d]/g, "");
          if (sameSymbol) {
            const hasEmbeddedYear = inputYear.length > 0;
            let matches = hasEmbeddedYear ? inputYear === refYear : true;
            if (matches && !hasEmbeddedYear && inputRef.page != null) {
              const refPages = extractPageNumbers(ref.raw);
              matches = refPages.length === 0 ||
                refPages.includes(inputRef.page) ||
                (inputRef.endPage != null && refPages.includes(inputRef.endPage));
            }
            if (matches) {
              const score = hasEmbeddedYear ? 0.80 : 0.75;
              if (!best || score > best.confidence) {
                best = { confidence: score, lesson, extract, ref };
              }
            }
          }
        }
      }
    }
  }

  return best;
}

// ─── Text matching ───────────────────────────────────────

function tryTextMatch(
  userInput: string,
): { confidence: number; lesson: IndexLesson; extract: IndexExtract; ref: IndexReference } | null {
  const inputTokens = tokenize(userInput);
  if (inputTokens.size === 0) return null;

  let best: { confidence: number; lesson: IndexLesson; extract: IndexExtract; ref: IndexReference } | null = null;

  for (const lesson of INDEX.lessons) {
    for (const extract of lesson.extracts) {
      for (const ref of extract.references) {
        // Article title match (higher weight)
        if (ref.articleTitle) {
          const titleTokens = tokenize(ref.articleTitle);
          const score = jaccard(inputTokens, titleTokens);
          // ponytail: scale confidence proportionally. 0.4 Jaccard = 0.65 conf, 0.7+ = 0.85
          if (score >= 0.4) {
            const confidence = Math.min(0.85, 0.60 + score * 0.35);
            if (!best || confidence > best.confidence) {
              best = { confidence, lesson, extract, ref };
            }
          }
        }

        // Caption match (lower weight — captions include reference text)
        const captionTokens = tokenize(extract.caption);
        const capScore = jaccard(inputTokens, captionTokens);
        if (capScore > 0.5) {
          const confidence = 0.70;
          if (!best || confidence > best.confidence) {
            best = { confidence, lesson, extract, ref };
          }
        }
      }
    }
  }

  return best;
}

// ─── Public API ──────────────────────────────────────────

const NO_MATCH: PrecursorMatchResult = { matched: false, confidence: 0, matchStrategy: "none" };

export function matchPrecursorQuestion(userInput: string): PrecursorMatchResult {
  if (!userInput || userInput.trim().length < 3) return NO_MATCH;

  // Strategy A: reference match
  const parsedRefs = parseWolReferences(userInput);
  const refMatch = tryReferenceMatch(parsedRefs);
  if (refMatch && refMatch.confidence >= 0.60) {
    return {
      matched: true,
      confidence: refMatch.confidence,
      lesson: {
        lessonKey: refMatch.lesson.lessonKey,
        title: refMatch.lesson.title,
        day: refMatch.lesson.day,
      },
      matchedExtract: {
        paragraphOrdinal: refMatch.extract.paragraphOrdinal,
        caption: refMatch.extract.caption,
        reference: refMatch.ref.raw,
        articleTitle: refMatch.ref.articleTitle,
      },
      matchStrategy: "reference",
    };
  }

  // Strategy B: text match
  const textMatch = tryTextMatch(userInput);
  if (textMatch && textMatch.confidence >= 0.60) {
    return {
      matched: true,
      confidence: textMatch.confidence,
      lesson: {
        lessonKey: textMatch.lesson.lessonKey,
        title: textMatch.lesson.title,
        day: textMatch.lesson.day,
      },
      matchedExtract: {
        paragraphOrdinal: textMatch.extract.paragraphOrdinal,
        caption: textMatch.extract.caption,
        reference: textMatch.ref.raw,
        articleTitle: textMatch.ref.articleTitle,
      },
      matchStrategy: "text",
    };
  }

  return NO_MATCH;
}
