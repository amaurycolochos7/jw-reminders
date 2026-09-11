/**
 * Topic Search Service v2 — BM25 ranking + full precursor book index.
 *
 * Searches:
 * 1. Bible nwt_S.json (31K verses) — BM25 ranked
 * 2. Precursor book full metadata (35 lessons, 290 extracts, 1001 Bible citations, 3452 words)
 *
 * ponytail: content BLOBs in pt14_S.db are AES-encrypted (z-a format, requires JW.org token).
 * We index all unencrypted metadata: titles, captions, article names, Bible citations, vocabulary.
 * This gives ~90% coverage for topic search. The 10% gap is paragraph-level text.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ───────────────────────────────────────────────

export interface SearchResult {
  source: "bible" | "precursor_lesson" | "precursor_extract" | "precursor_citation";
  reference: string;
  text: string;
  score: number;
  metadata: {
    book?: string;
    chapter?: number;
    verse?: number;
    verseEnd?: number;
    lesson?: string;
    lessonKey?: string;
    day?: string;
    paragraphOrdinal?: number;
    articleTitle?: string;
    documentId?: number;
    sourceId?: string;
  };
}

export interface TopicSearchResult {
  query: string;
  expandedTerms: string[];
  bibleResults: SearchResult[];
  precursorResults: SearchResult[];
  totalResults: number;
}

// ─── BM25 Parameters ─────────────────────────────────────

const BM25_K1 = 1.2;
const BM25_B = 0.75;

// ─── JW Synonym Map ─────────────────────────────────────

const JW_SYNONYMS: Record<string, string[]> = {
  amor: ["amar", "cariño", "afecto", "bondad", "benevolencia", "leal"],
  fe: ["confianza", "creer", "fiel", "fidelidad", "lealtad"],
  oracion: ["orar", "suplica", "peticion", "ruego", "comunicacion"],
  predicacion: ["predicar", "ministerio", "ensenar", "publicar", "testimonio", "anunciar", "proclamar"],
  humildad: ["humilde", "modestia", "modesto", "mansedumbre", "manso"],
  obediencia: ["obedecer", "obediente", "sumision", "sujecion"],
  paciencia: ["paciente", "aguante", "aguantar", "perseverancia", "perseverar"],
  esperanza: ["esperar", "futuro", "promesa", "confianza"],
  gozo: ["gozar", "alegria", "felicidad", "feliz", "regocijo"],
  pecado: ["pecar", "pecador", "transgresion", "falta", "error", "imperfeccion"],
  perdon: ["perdonar", "misericordia", "compasion", "clemencia"],
  sabiduria: ["sabio", "prudencia", "prudente", "discernimiento", "entendimiento"],
  muerte: ["morir", "muerto", "resurreccion", "resucitar"],
  vida: ["vivir", "vida eterna", "existencia"],
  reino: ["gobierno", "gobernar", "reinar", "trono", "soberania"],
  jehova: ["dios", "creador", "todopoderoso", "altisimo", "soberano"],
  jesus: ["cristo", "jesucristo", "mesias", "hijo", "cordero", "rescate"],
  biblia: ["escrituras", "palabra", "escritura"],
  congregacion: ["hermanos", "reunion", "asamblea"],
  precursor: ["ministerio", "servicio", "predicacion", "publicador", "pionero"],
  neutral: ["neutralidad", "politica", "gobierno"],
  creacion: ["crear", "creador", "diseno", "naturaleza"],
  bautismo: ["bautizar", "dedicacion", "dedicarse"],
  tentacion: ["tentar", "prueba", "resistir"],
  integridad: ["integro", "recto", "rectitud", "lealtad"],
  maestro: ["ensenar", "ensenanza", "curso", "estudiante", "estudio"],
  revisita: ["volver", "interes", "interesado", "progreso"],
  libro: ["publicacion", "estudio", "leccion", "capitulo"],
};

// ─── Stopwords ───────────────────────────────────────────

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
  "en", "con", "por", "para", "que", "se", "su", "sus", "es", "son",
  "no", "si", "como", "mas", "pero", "ya", "lo", "le",
  "me", "te", "nos", "les", "mi", "tu", "muy", "tambien", "hay", "ha", "han",
  "ser", "esta", "estan", "tiene", "tienen", "todo", "toda", "todos", "cada",
  "sobre", "entre", "sin", "desde", "hasta", "cuando", "donde", "porque",
  "cual", "quien", "otro", "otra", "otros", "habia", "haber", "fue",
]);

// ─── Tokenizer ───────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// ─── Bible Index (BM25) ─────────────────────────────────

interface BibleDoc {
  book: string;
  bookNumber: number;
  chapter: number;
  verse: number;
  text: string;
  tokens: string[];
  length: number;
}

let bibleDocs: BibleDoc[] | null = null;
let bibleIDF: Map<string, number> | null = null;
let bibleAvgDL = 0;
let bibleWordIndex: Map<string, number[]> | null = null;
let bibleRefIndex: Map<string, number> | null = null; // "Book Chapter:Verse" → index

function loadBibleIndex(): void {
  if (bibleDocs) return;

  const biblePath = resolve(__dirname, "../../../../../data/bible/nwt_S.json");
  const raw = readFileSync(biblePath, "utf8");
  const data = JSON.parse(raw);

  bibleDocs = [];
  bibleWordIndex = new Map();
  const docFreq = new Map<string, number>(); // word → number of docs containing it

  for (const book of data.books) {
    for (const chapter of book.chapters) {
      for (const verse of chapter.verses) {
        const idx = bibleDocs.length;
        const tokens = tokenize(verse.text);
        bibleDocs.push({
          book: book.name,
          bookNumber: book.number,
          chapter: chapter.chapter,
          verse: verse.number,
          text: verse.text,
          tokens,
          length: tokens.length,
        });

        const seen = new Set<string>();
        for (const token of tokens) {
          if (!bibleWordIndex.has(token)) bibleWordIndex.set(token, []);
          bibleWordIndex.get(token)!.push(idx);
          if (!seen.has(token)) { seen.add(token); docFreq.set(token, (docFreq.get(token) || 0) + 1); }
        }
      }
    }
  }

  // Compute IDF for each term
  const N = bibleDocs.length;
  bibleIDF = new Map();
  for (const [term, df] of docFreq) {
    bibleIDF.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  // Average document length
  bibleAvgDL = bibleDocs.reduce((sum, d) => sum + d.length, 0) / N;

  // Build reverse reference index for O(1) explicit ref lookup
  bibleRefIndex = new Map();
  for (let i = 0; i < bibleDocs.length; i++) {
    const d = bibleDocs[i];
    bibleRefIndex.set(`${d.book} ${d.chapter}:${d.verse}`, i);
  }

  console.log(`[topic-search] Bible BM25 index: ${N} verses, ${bibleWordIndex.size} terms, avgDL=${bibleAvgDL.toFixed(1)}`);
}

// ─── Precursor Index ─────────────────────────────────────

interface PrecursorDoc {
  type: "lesson" | "extract" | "citation";
  text: string;
  tokens: string[];
  length: number;
  metadata: {
    documentId?: number;
    lesson?: string;
    day?: string;
    paragraphOrdinal?: number;
    articleTitle?: string;
    reference?: string;
    sourceId?: string;
    bookName?: string;
    chapter?: number;
    verseStart?: number;
    verseEnd?: number;
  };
}

let precursorDocs: PrecursorDoc[] | null = null;
let precursorIDF: Map<string, number> | null = null;
let precursorAvgDL = 0;
let precursorWordIndex: Map<string, number[]> | null = null;

function loadPrecursorIndex(): void {
  if (precursorDocs) return;

  const indexPath = resolve(__dirname, "../../../../../data/precursor-study-index/pt14_S.metadata-index.json");
  const raw = readFileSync(indexPath, "utf8");
  const data = JSON.parse(raw);

  precursorDocs = [];
  precursorWordIndex = new Map();
  const docFreq = new Map<string, number>();

  // Index lessons by title
  for (const lesson of data.lessons || []) {
    const text = [lesson.title, lesson.tocTitle, lesson.contextTitle, lesson.subtitle].filter(Boolean).join(" ");
    const tokens = tokenize(text);
    const idx = precursorDocs.length;
    precursorDocs.push({
      type: "lesson",
      text,
      tokens,
      length: tokens.length,
      metadata: {
        documentId: lesson.documentId,
        lesson: lesson.title,
        day: `DÍA ${Math.ceil((lesson.chapterNumber || 1) / 6)}`,
        sourceId: `pt14_lesson_${lesson.documentId}`,
      },
    });
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!precursorWordIndex.has(t)) precursorWordIndex.set(t, []);
      precursorWordIndex.get(t)!.push(idx);
      if (!seen.has(t)) { seen.add(t); docFreq.set(t, (docFreq.get(t) || 0) + 1); }
    }
  }

  // Index extracts by caption + article title
  for (const ext of data.extracts || []) {
    const text = [ext.captionRaw, ext.articleTitle, ext.reference].filter(Boolean).join(" ");
    const tokens = tokenize(text);
    if (tokens.length === 0) continue;
    const idx = precursorDocs.length;
    precursorDocs.push({
      type: "extract",
      text: ext.captionRaw || ext.articleTitle || "",
      tokens,
      length: tokens.length,
      metadata: {
        documentId: ext.documentId,
        paragraphOrdinal: ext.beginParagraph,
        articleTitle: ext.articleTitle,
        reference: ext.reference,
        sourceId: `pt14_extract_${ext.extractId}`,
      },
    });
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!precursorWordIndex.has(t)) precursorWordIndex.set(t, []);
      precursorWordIndex.get(t)!.push(idx);
      if (!seen.has(t)) { seen.add(t); docFreq.set(t, (docFreq.get(t) || 0) + 1); }
    }
  }

  // Index Bible citations
  for (const cit of data.bibleCitations || []) {
    const text = cit.reference || "";
    const tokens = tokenize(text);
    if (tokens.length === 0) continue;
    const idx = precursorDocs.length;
    precursorDocs.push({
      type: "citation",
      text,
      tokens,
      length: tokens.length,
      metadata: {
        documentId: cit.documentId,
        paragraphOrdinal: cit.paragraphOrdinal,
        reference: cit.reference,
        bookName: cit.bookName,
        chapter: cit.chapter,
        verseStart: cit.verseStart,
        verseEnd: cit.verseEnd,
        sourceId: `pt14_citation_${cit.documentId}_${cit.paragraphOrdinal}`,
      },
    });
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!precursorWordIndex.has(t)) precursorWordIndex.set(t, []);
      precursorWordIndex.get(t)!.push(idx);
      if (!seen.has(t)) { seen.add(t); docFreq.set(t, (docFreq.get(t) || 0) + 1); }
    }
  }

  // Compute IDF
  const N = precursorDocs.length;
  precursorIDF = new Map();
  for (const [term, df] of docFreq) {
    precursorIDF.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }
  precursorAvgDL = precursorDocs.reduce((sum, d) => sum + d.length, 0) / (N || 1);

  console.log(`[topic-search] Precursor BM25 index: ${N} docs, ${precursorWordIndex.size} terms`);
}

// ─── BM25 Scoring ────────────────────────────────────────

function bm25Score(
  queryTerms: string[],
  docTokens: string[],
  docLength: number,
  avgDL: number,
  idfMap: Map<string, number>,
): number {
  let score = 0;
  const termFreq = new Map<string, number>();
  for (const t of docTokens) termFreq.set(t, (termFreq.get(t) || 0) + 1);

  for (const term of queryTerms) {
    const tf = termFreq.get(term) || 0;
    if (tf === 0) continue;
    const idf = idfMap.get(term) || 0;
    const numerator = tf * (BM25_K1 + 1);
    const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDL));
    score += idf * (numerator / denominator);
  }

  return score;
}

// ─── Doctrinal Topic Map (curated verse boosts) ──────────
// ponytail: hand-curated map of doctrinal topics → relevant verses.
// These get a strong boost when the query matches the topic.

interface TopicEntry {
  keywords: string[]; // triggers (any match activates)
  verses: string[];   // references to boost
  boostFactor: number;
}

const DOCTRINAL_TOPIC_MAP: TopicEntry[] = [
  {
    keywords: ["cobrar", "gratis", "lucrar", "dinero", "ensenar", "pagar", "precio", "comercio", "vender", "recibir", "dar"],
    verses: ["Mateo 10:8", "Proverbios 23:23", "2 Corintios 2:17", "Hechos 20:33", "Hechos 20:34", "Hechos 20:35", "1 Tesalonicenses 2:9", "1 Corintios 9:18"],
    boostFactor: 5.0,
  },
  {
    keywords: ["predicacion", "predicar", "ministerio", "proclamar", "anunciar", "testimonio", "publicador"],
    verses: ["Mateo 24:14", "Mateo 28:19", "Mateo 28:20", "Hechos 20:20", "Romanos 10:13", "Romanos 10:14", "Romanos 10:15", "2 Timoteo 4:2", "Isaías 61:1"],
    boostFactor: 4.0,
  },
  {
    keywords: ["humildad", "humilde", "modestia", "modesto", "manso", "mansedumbre"],
    verses: ["Santiago 4:6", "1 Pedro 5:5", "1 Pedro 5:6", "Filipenses 2:3", "Filipenses 2:4", "Proverbios 11:2", "Miqueas 6:8", "Proverbios 22:4"],
    boostFactor: 4.5,
  },
  {
    keywords: ["aguante", "aguantar", "prueba", "pruebas", "perseverar", "sufrimiento", "dificultad"],
    verses: ["Santiago 1:2", "Santiago 1:3", "Santiago 1:4", "Romanos 5:3", "Romanos 5:4", "Romanos 5:5", "Hebreos 12:1", "1 Pedro 5:10", "Jeremías 12:5"],
    boostFactor: 4.5,
  },
  {
    keywords: ["maestro", "ensenar", "ensenanza", "curso", "estudiante", "estudio", "biblico"],
    verses: ["2 Timoteo 2:24", "Nehemías 8:8", "Colosenses 4:6", "Mateo 28:19", "Mateo 28:20", "Proverbios 16:23", "Hechos 20:20"],
    boostFactor: 4.0,
  },
  {
    keywords: ["oracion", "orar", "comunicacion", "suplica", "pedir"],
    verses: ["Filipenses 4:6", "Filipenses 4:7", "1 Tesalonicenses 5:17", "Salmos 65:2", "Proverbios 15:29", "Santiago 5:16", "1 Juan 5:14"],
    boostFactor: 4.0,
  },
  {
    keywords: ["fe", "confianza", "confiar", "creer", "fidelidad"],
    verses: ["Hebreos 11:1", "Hebreos 11:6", "Romanos 10:17", "Santiago 2:26", "2 Corintios 5:7", "Proverbios 3:5", "Proverbios 3:6"],
    boostFactor: 4.0,
  },
  {
    keywords: ["amor", "amar", "carino", "afecto"],
    verses: ["1 Corintios 13:4", "1 Corintios 13:5", "1 Corintios 13:7", "1 Corintios 13:8", "1 Juan 4:8", "Juan 3:16", "Mateo 22:37", "Mateo 22:39"],
    boostFactor: 4.0,
  },
  {
    keywords: ["nombre", "jehova", "santificar", "santificacion"],
    verses: ["Éxodo 3:15", "Salmos 83:18", "Mateo 6:9", "Isaías 42:8", "Ezequiel 36:23"],
    boostFactor: 4.5,
  },
  {
    keywords: ["muerte", "morir", "resurreccion", "resucitar", "esperanza"],
    verses: ["Juan 5:28", "Juan 5:29", "Hechos 24:15", "Revelación 21:3", "Revelación 21:4", "Eclesiastés 9:5", "Salmos 146:4"],
    boostFactor: 4.0,
  },
  {
    keywords: ["reino", "gobierno", "gobernar", "paraiso", "tierra"],
    verses: ["Daniel 2:44", "Mateo 6:10", "Lucas 23:43", "Salmos 37:10", "Salmos 37:11", "Salmos 37:29", "Revelación 21:3", "Revelación 21:4"],
    boostFactor: 4.0,
  },
  {
    keywords: ["neutral", "neutralidad", "politica", "gobierno", "guerra", "militar"],
    verses: ["Juan 17:16", "Juan 18:36", "Isaías 2:4", "Miqueas 4:3", "2 Corintios 10:3", "2 Corintios 10:4"],
    boostFactor: 4.5,
  },
];

/**
 * Finds which doctrinal topics match the query and returns boosted verse references.
 */
function getDoctrinalBoosts(queryTokens: string[]): Map<string, number> {
  const boosts = new Map<string, number>();

  for (const topic of DOCTRINAL_TOPIC_MAP) {
    const matchCount = topic.keywords.filter((k) => queryTokens.includes(k)).length;
    if (matchCount > 0) {
      // More keyword matches = stronger boost
      const factor = topic.boostFactor * (1 + (matchCount - 1) * 0.3);
      for (const verse of topic.verses) {
        const current = boosts.get(verse) || 0;
        boosts.set(verse, Math.max(current, factor));
      }
    }
  }

  return boosts;
}

// ─── Query Expansion ─────────────────────────────────────

function expandQuery(query: string): string[] {
  const baseTokens = tokenize(query);
  const expanded = new Set(baseTokens);

  for (const token of baseTokens) {
    for (const [key, synonyms] of Object.entries(JW_SYNONYMS)) {
      if (token === key || synonyms.some((s) => tokenize(s).includes(token))) {
        expanded.add(key);
        for (const syn of synonyms) {
          for (const t of tokenize(syn)) expanded.add(t);
        }
      }
    }
  }

  return [...expanded];
}

// ─── Search Functions (multi-layer scoring) ──────────────

function searchBible(
  terms: string[],
  maxResults: number,
  contextBoost: number,
  doctrinalBoosts: Map<string, number>,
  explicitRefs: Set<string>,
): SearchResult[] {
  loadBibleIndex();
  if (!bibleDocs || !bibleWordIndex || !bibleIDF) return [];

  // Find candidates from word index
  const candidates = new Set<number>();
  for (const term of terms) {
    const indices = bibleWordIndex.get(term);
    if (indices) for (const idx of indices) candidates.add(idx);
  }

  // CRITICAL: inject explicit references as candidates even if no keyword match
  if (explicitRefs.size > 0 && bibleRefIndex) {
    for (const ref of explicitRefs) {
      const idx = bibleRefIndex.get(ref);
      if (idx !== undefined) candidates.add(idx);
    }
  }

  // Also inject doctrinal-boosted verses as candidates
  if (bibleRefIndex) {
    for (const boostedRef of doctrinalBoosts.keys()) {
      const idx = bibleRefIndex.get(boostedRef);
      if (idx !== undefined) candidates.add(idx);
    }
  }

  const scored: Array<[number, number]> = [];
  for (const idx of candidates) {
    const doc = bibleDocs[idx];
    let score = bm25Score(terms, doc.tokens, doc.length, bibleAvgDL, bibleIDF);

    // Layer 1: context boost
    score *= contextBoost;

    // Layer 2: doctrinal topic boost — ensure boosted verses have minimum floor
    const ref = `${doc.book} ${doc.chapter}:${doc.verse}`;
    const topicBoost = doctrinalBoosts.get(ref);
    if (topicBoost) {
      // Floor ensures curated verses always compete with BM25 results
      // A verse with 0 BM25 but strong doctrinal relevance should still rank high
      score = Math.max(score, 5.0) * topicBoost;
    }

    // Layer 3: explicit reference boost (user mentioned this verse) — MUST be #1
    if (explicitRefs.has(ref)) score = Math.max(score, 100.0) * 100.0;

    // Layer 4: generic penalty
    if (doc.length < 5 && score < 5) score *= 0.5;

    if (score > 0.3) scored.push([idx, score]);
  }

  scored.sort((a, b) => b[1] - a[1]);

  return scored.slice(0, maxResults).map(([idx, score]) => {
    const d = bibleDocs![idx];
    return {
      source: "bible" as const,
      reference: `${d.book} ${d.chapter}:${d.verse}`,
      text: d.text,
      score,
      metadata: {
        book: d.book,
        chapter: d.chapter,
        verse: d.verse,
        sourceId: `bible_${d.bookNumber}_${d.chapter}_${d.verse}`,
      },
    };
  });
}

function searchPrecursor(terms: string[], maxResults: number, contextBoost: number): SearchResult[] {
  loadPrecursorIndex();
  if (!precursorDocs || !precursorWordIndex || !precursorIDF) return [];

  const candidates = new Set<number>();
  for (const term of terms) {
    const indices = precursorWordIndex.get(term);
    if (indices) for (const idx of indices) candidates.add(idx);
  }

  const scored: Array<[number, number]> = [];
  for (const idx of candidates) {
    const doc = precursorDocs[idx];
    let score = bm25Score(terms, doc.tokens, doc.length, precursorAvgDL, precursorIDF) * contextBoost;
    if (doc.type === "lesson") score *= 1.5;
    if (doc.type === "extract") score *= 1.3;
    if (score > 0.3) scored.push([idx, score]);
  }

  scored.sort((a, b) => b[1] - a[1]);

  return scored.slice(0, maxResults).map(([idx, score]) => {
    const d = precursorDocs![idx];
    return {
      source: d.type === "citation" ? "precursor_citation" as const : d.type === "lesson" ? "precursor_lesson" as const : "precursor_extract" as const,
      reference: d.metadata.reference || d.metadata.lesson || d.text,
      text: d.text,
      score,
      metadata: d.metadata,
    };
  });
}

// ─── Explicit Reference Detection ────────────────────────

function detectExplicitReferences(query: string): Set<string> {
  const refs = new Set<string>();
  // Match patterns like "Mateo 10:8", "Jeremías 12:5", "2 Corintios 2:17"
  const refPattern = /(\d?\s?[A-ZÁÉÍÓÚ][a-záéíóúñ]+)\s+(\d+):(\d+)/g;
  let match;
  while ((match = refPattern.exec(query)) !== null) {
    const book = match[1].trim();
    const chapter = match[2];
    const verse = match[3];
    refs.add(`${book} ${chapter}:${verse}`);
  }
  return refs;
}

// ─── Public API ──────────────────────────────────────────

/**
 * Search all local sources by topic.
 * Multi-layer scoring: BM25 × synonym_boost × doctrinal_topic_boost × explicit_reference_boost × source_type_boost - generic_penalty
 */
export function searchByTopic(query: string): TopicSearchResult {
  const expandedTerms = expandQuery(query);
  const queryLower = query.toLowerCase();
  const queryTokens = tokenize(query);

  // Detect explicit references in query
  const explicitRefs = detectExplicitReferences(query);

  // Contextual boost
  const precursorKeywords = ["precursor", "enseñar", "curso", "maestro", "revisita", "predicación", "formación", "ministerio", "libro"];
  const isPrecursorQuery = precursorKeywords.some((k) => queryLower.includes(k));
  const doctrinalKeywords = ["biblia", "dice", "versículo", "texto", "escritura", "jehová", "dios", "jesús"];
  const isDoctrinalQuery = doctrinalKeywords.some((k) => queryLower.includes(k));

  const bibleBoost = isDoctrinalQuery ? 1.3 : 1.0;
  const precursorBoost = isPrecursorQuery ? 1.5 : 1.0;

  // Get doctrinal topic boosts
  const doctrinalBoosts = getDoctrinalBoosts(queryTokens);

  const bibleResults = searchBible(expandedTerms, 15, bibleBoost, doctrinalBoosts, explicitRefs);
  const precursorResults = searchPrecursor(expandedTerms, 10, precursorBoost);

  return {
    query,
    expandedTerms,
    bibleResults,
    precursorResults,
    totalResults: bibleResults.length + precursorResults.length,
  };
}

/**
 * Search Bible only by keywords with doctrinal boosting.
 */
export function searchBibleByKeywords(query: string, maxResults = 10): SearchResult[] {
  const terms = expandQuery(query);
  const queryTokens = tokenize(query);
  const doctrinalBoosts = getDoctrinalBoosts(queryTokens);
  const explicitRefs = detectExplicitReferences(query);
  return searchBible(terms, maxResults, 1.0, doctrinalBoosts, explicitRefs);
}

/**
 * Get expanded terms for a query.
 */
export function getRelatedTerms(query: string): string[] {
  return expandQuery(query);
}
