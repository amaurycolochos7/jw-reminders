/**
 * BibleLocalResolver — resolves Bible references from the local nwt_S.json file.
 *
 * Priority: local → WOL fetch fallback (handled by caller in wol-resolver).
 * This service only handles the local resolution.
 *
 * ponytail: single-file, no class, JSON cached at module level. ~30 lines of real logic.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types ───────────────────────────────────────────────

export interface BibleVerse {
  number: number;
  text: string;
}

interface BibleChapter {
  chapter: number;
  verses: BibleVerse[];
}

interface BibleBook {
  number: number;
  name: string;
  chapters: BibleChapter[];
}

interface BibleData {
  translation: string;
  language: string;
  generatedAt: string;
  totalBooks: number;
  totalChapters: number;
  totalVerses: number;
  books: BibleBook[];
}

export interface LocalBibleResult {
  type: "bible";
  raw: string;
  status: "resolved" | "extraction_failed";
  sourceOrigin: "local_bible" | "none";
  url: string;
  urlType: "direct";
  title: string;
  publication: string;
  book: string;
  bookNumber: number;
  chapter: number;
  verses: string;
  extractedContent: Array<{
    label: string;
    paragraphNumber: number;
    text: string;
    textLength: number;
  }>;
  excerpt: string;
  notes?: string;
}

// ─── Bible book number mapping (reuses same names as wol-resolver) ─────

const BIBLE_BOOK_NUMBERS: Record<string, number> = {
  "Génesis": 1, "Éxodo": 2, "Levítico": 3, "Números": 4, "Deuteronomio": 5,
  "Josué": 6, "Jueces": 7, "Rut": 8, "1 Samuel": 9, "2 Samuel": 10,
  "1 Reyes": 11, "2 Reyes": 12, "1 Crónicas": 13, "2 Crónicas": 14,
  "Esdras": 15, "Nehemías": 16, "Ester": 17, "Job": 18, "Salmos": 19,
  "Proverbios": 20, "Eclesiastés": 21, "Cantar de los Cantares": 22,
  "Isaías": 23, "Jeremías": 24, "Lamentaciones": 25, "Ezequiel": 26,
  "Daniel": 27, "Oseas": 28, "Joel": 29, "Amós": 30, "Abdías": 31,
  "Jonás": 32, "Miqueas": 33, "Nahúm": 34, "Habacuc": 35, "Sofonías": 36,
  "Ageo": 37, "Zacarías": 38, "Malaquías": 39, "Mateo": 40, "Marcos": 41,
  "Lucas": 42, "Juan": 43, "Hechos": 44, "Romanos": 45, "1 Corintios": 46,
  "2 Corintios": 47, "Gálatas": 48, "Efesios": 49, "Filipenses": 50,
  "Colosenses": 51, "1 Tesalonicenses": 52, "2 Tesalonicenses": 53,
  "1 Timoteo": 54, "2 Timoteo": 55, "Tito": 56, "Filemón": 57,
  "Hebreos": 58, "Santiago": 59, "1 Pedro": 60, "2 Pedro": 61,
  "1 Juan": 62, "2 Juan": 63, "3 Juan": 64, "Judas": 65, "Revelación": 66,
};

// ─── Load Bible data (cached at module level) ────────────

let bibleData: BibleData | null = null;

function loadBible(): BibleData {
  if (bibleData) return bibleData;

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const biblePath = resolve(__dirname, "../../../../../data/bible/nwt_S.json");

  try {
    const raw = readFileSync(biblePath, "utf8");
    bibleData = JSON.parse(raw) as BibleData;
    return bibleData;
  } catch (err) {
    console.error("[bible-local-resolver] Failed to load nwt_S.json:", err);
    // Return empty structure so callers get extraction_failed
    bibleData = { translation: "nwt", language: "es", generatedAt: "", totalBooks: 0, totalChapters: 0, totalVerses: 0, books: [] };
    return bibleData;
  }
}

// ─── Verse number parser ─────────────────────────────────

function parseVerseNumbers(verses: string): number[] {
  const result: number[] = [];
  const parts = verses.split(/\s*,\s*/);
  for (const part of parts) {
    if (part.includes("-") || part.includes("–")) {
      const [a, b] = part.split(/[-–]/).map(s => parseInt(s.trim(), 10));
      if (!isNaN(a) && !isNaN(b)) {
        for (let i = a; i <= b; i++) result.push(i);
      }
    } else {
      const n = parseInt(part.trim(), 10);
      if (!isNaN(n)) result.push(n);
    }
  }
  return result;
}

// ─── Public API ──────────────────────────────────────────

/**
 * Resolves a Bible reference from the local nwt_S.json file.
 * Returns a LocalBibleResult with real verse text or extraction_failed.
 */
export function resolveFromLocal(book: string, chapter: number, verses: string, raw: string): LocalBibleResult {
  const bible = loadBible();
  const bookNumber = BIBLE_BOOK_NUMBERS[book];

  if (!bookNumber) {
    return {
      type: "bible", raw, status: "extraction_failed", sourceOrigin: "none",
      url: `https://wol.jw.org/es/wol/s/r4/lp-s?q=${encodeURIComponent(raw)}`,
      urlType: "direct", title: raw, publication: "Traducción del Nuevo Mundo",
      book, bookNumber: 0, chapter, verses,
      extractedContent: [], excerpt: "",
      notes: `Libro bíblico "${book}" no mapeado a número.`,
    };
  }

  const bookData = bible.books.find(b => b.number === bookNumber);
  if (!bookData) {
    return {
      type: "bible", raw, status: "extraction_failed", sourceOrigin: "none",
      url: `https://wol.jw.org/es/wol/b/r4/lp-s/nwt/${bookNumber}/${chapter}`,
      urlType: "direct", title: raw, publication: "Traducción del Nuevo Mundo",
      book, bookNumber, chapter, verses,
      extractedContent: [], excerpt: "",
      notes: `Libro ${book} (${bookNumber}) no encontrado en Biblia local.`,
    };
  }

  const chapterData = bookData.chapters.find(c => c.chapter === chapter);
  if (!chapterData) {
    return {
      type: "bible", raw, status: "extraction_failed", sourceOrigin: "none",
      url: `https://wol.jw.org/es/wol/b/r4/lp-s/nwt/${bookNumber}/${chapter}`,
      urlType: "direct", title: raw, publication: "Traducción del Nuevo Mundo",
      book, bookNumber, chapter, verses,
      extractedContent: [], excerpt: "",
      notes: `Capítulo ${chapter} no encontrado en ${book}.`,
    };
  }

  const verseNumbers = parseVerseNumbers(verses);
  const extractedContent: LocalBibleResult["extractedContent"] = [];

  for (const vNum of verseNumbers) {
    const verseData = chapterData.verses.find(v => v.number === vNum);
    if (verseData && verseData.text.trim().length > 0) {
      extractedContent.push({
        label: `${book} ${chapter}:${vNum}`,
        paragraphNumber: vNum,
        text: verseData.text,
        textLength: verseData.text.length,
      });
    }
  }

  if (extractedContent.length === 0) {
    return {
      type: "bible", raw, status: "extraction_failed", sourceOrigin: "none",
      url: `https://wol.jw.org/es/wol/b/r4/lp-s/nwt/${bookNumber}/${chapter}`,
      urlType: "direct", title: raw, publication: "Traducción del Nuevo Mundo",
      book, bookNumber, chapter, verses,
      extractedContent: [], excerpt: "",
      notes: `Versículo(s) ${verses} no encontrado(s) en ${book} ${chapter}.`,
    };
  }

  const excerpt = extractedContent.map(v => v.text).join(" ").slice(0, 400);

  return {
    type: "bible", raw, status: "resolved", sourceOrigin: "local_bible",
    url: `https://wol.jw.org/es/wol/b/r4/lp-s/nwt/${bookNumber}/${chapter}`,
    urlType: "direct",
    title: raw,
    publication: "Traducción del Nuevo Mundo",
    book, bookNumber, chapter, verses,
    extractedContent,
    excerpt,
    notes: `${extractedContent.length} versículo(s) resuelto(s) desde Biblia local.`,
  };
}
