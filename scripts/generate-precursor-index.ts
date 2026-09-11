/**
 * PrecursorJwpubIndexer
 * 
 * Extrae el índice local del Libro de los precursores (pt14_S.db)
 * y genera data/precursor-study-index/pt14_S.index.json
 * 
 * Fuentes de datos:
 * - Document: lecciones (ContextTitle + Title)
 * - PublicationViewItem: jerarquía DÍA → Lecciones
 * - Extract + DocumentExtract: referencias con captions legibles
 * - BibleCitation: citas bíblicas por párrafo
 * - RefPublication: metadatos de publicaciones referenciadas
 * 
 * Run: npx tsx scripts/generate-precursor-index.ts
 */

import Database from "better-sqlite3";
import { resolve } from "path";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";

// ─── Config ──────────────────────────────────────────────

const DB_PATH = resolve(__dirname, "../pt14_S_extracted/contents_db/pt14_S.db");
const OUTPUT_DIR = resolve(__dirname, "../data/precursor-study-index");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "pt14_S.index.json");

if (!existsSync(DB_PATH)) {
  console.error("❌ No se encontró:", DB_PATH);
  process.exit(1);
}

// ─── Types ───────────────────────────────────────────────

interface IndexedReference {
  raw: string;
  type: "wol" | "bible";
  articleTitle?: string;
  publicationSymbol?: string;
  publicationTitle?: string;
  year?: number;
  issueTag?: string;
  mepsDocumentId?: number;
  refParagraphs?: string; // "1-31" or "14-14"
  link?: string;
}

interface IndexedExtract {
  paragraphOrdinal: number;
  caption: string;
  references: IndexedReference[];
}

interface IndexedBibleCitation {
  paragraphOrdinal: number;
  firstVerseId: number;
  lastVerseId: number;
  jwpubLink?: string;
}

interface IndexedLesson {
  documentId: number;
  mepsDocumentId: number;
  lessonKey: string;
  title: string;
  day: string;
  dayNumber: number;
  order: number;
  paragraphCount: number;
  firstPage: number;
  lastPage: number;
  extracts: IndexedExtract[];
  bibleCitations: IndexedBibleCitation[];
}

interface PrecursorIndex {
  publication: {
    key: string;
    title: string;
    shortTitle: string;
    language: string;
    year: number;
    sourceHash: string;
    importedAt: string;
    totalLessons: number;
    totalExtracts: number;
    totalBibleCitations: number;
  };
  lessons: IndexedLesson[];
}

// ─── Main ────────────────────────────────────────────────

const db = new Database(DB_PATH, { readonly: true });

// Publication metadata
const pub = db.prepare("SELECT * FROM Publication LIMIT 1").get() as any;

// Build source hash from file size
const fileStats = require("fs").statSync(DB_PATH);
const sourceHash = createHash("sha256")
  .update(`${DB_PATH}:${fileStats.size}:${fileStats.mtimeMs}`)
  .digest("hex")
  .slice(0, 16);

// ─── Build day → lesson mapping from PublicationViewItem ─

interface ViewItem {
  PublicationViewItemId: number;
  ParentPublicationViewItemId: number;
  Title: string;
  DefaultDocumentId: number;
}

const viewItems = db.prepare(
  "SELECT PublicationViewItemId, ParentPublicationViewItemId, Title, DefaultDocumentId FROM PublicationViewItem ORDER BY PublicationViewItemId"
).all() as ViewItem[];

// Find DÍA parent items
const dayItems = viewItems.filter(v => v.Title.startsWith("DÍA "));
const dayMap = new Map<number, { day: string; dayNumber: number }>();
for (const day of dayItems) {
  const dayNum = parseInt(day.Title.replace("DÍA ", ""), 10);
  // Children of this day item
  const children = viewItems.filter(v => v.ParentPublicationViewItemId === day.PublicationViewItemId);
  for (const child of children) {
    if (child.DefaultDocumentId >= 0) {
      dayMap.set(child.DefaultDocumentId, { day: day.Title, dayNumber: dayNum });
    }
  }
}

// ─── Get all lesson documents ────────────────────────────

interface DocRow {
  DocumentId: number;
  MepsDocumentId: number;
  ContextTitle: string;
  Title: string;
  ParagraphCount: number;
  FirstPageNumber: number;
  LastPageNumber: number;
}

const documents = db.prepare(
  "SELECT DocumentId, MepsDocumentId, ContextTitle, Title, ParagraphCount, FirstPageNumber, LastPageNumber FROM Document WHERE ContextTitle LIKE 'LECCIÓN%' ORDER BY DocumentId"
).all() as DocRow[];

// ─── Get extracts per document ───────────────────────────

interface ExtractRow {
  DocumentId: number;
  BeginParagraphOrdinal: number;
  ExtractId: number;
  Link: string;
  Caption: string;
  RefPublicationId: number;
  RefMepsDocumentId: number;
  RefBeginParagraphOrdinal: number | null;
  RefEndParagraphOrdinal: number | null;
}

const allExtracts = db.prepare(`
  SELECT de.DocumentId, de.BeginParagraphOrdinal, e.ExtractId, e.Link, e.Caption,
         e.RefPublicationId, e.RefMepsDocumentId, e.RefBeginParagraphOrdinal, e.RefEndParagraphOrdinal
  FROM DocumentExtract de
  JOIN Extract e ON de.ExtractId = e.ExtractId
  ORDER BY de.DocumentId, de.BeginParagraphOrdinal
`).all() as ExtractRow[];

// Group by document
const extractsByDoc = new Map<number, ExtractRow[]>();
for (const ex of allExtracts) {
  const arr = extractsByDoc.get(ex.DocumentId) || [];
  arr.push(ex);
  extractsByDoc.set(ex.DocumentId, arr);
}

// ─── Get RefPublication metadata ─────────────────────────

interface RefPubRow {
  RefPublicationId: number;
  Symbol: string;
  Title: string;
  Year: number;
  IssueTagNumber: string;
}

const refPubs = db.prepare("SELECT RefPublicationId, Symbol, Title, Year, IssueTagNumber FROM RefPublication").all() as RefPubRow[];
const refPubMap = new Map<number, RefPubRow>();
for (const rp of refPubs) refPubMap.set(rp.RefPublicationId, rp);

// ─── Get Bible citations per document ────────────────────

interface BibleCitRow {
  DocumentId: number;
  ParagraphOrdinal: number;
  FirstBibleVerseId: number;
  LastBibleVerseId: number;
  HyperlinkId: number;
}

const allBibleCits = db.prepare(`
  SELECT bc.DocumentId, bc.ParagraphOrdinal, bc.FirstBibleVerseId, bc.LastBibleVerseId, bc.HyperlinkId
  FROM BibleCitation bc
  ORDER BY bc.DocumentId, bc.ParagraphOrdinal
`).all() as BibleCitRow[];

const bibleCitsByDoc = new Map<number, BibleCitRow[]>();
for (const bc of allBibleCits) {
  const arr = bibleCitsByDoc.get(bc.DocumentId) || [];
  arr.push(bc);
  bibleCitsByDoc.set(bc.DocumentId, arr);
}

// Get hyperlink map for jwpub:// links
interface HyperlinkRow { HyperlinkId: number; Link: string; }
const hyperlinks = db.prepare("SELECT HyperlinkId, Link FROM Hyperlink WHERE Link LIKE 'jwpub://%'").all() as HyperlinkRow[];
const hyperlinkMap = new Map<number, string>();
for (const h of hyperlinks) hyperlinkMap.set(h.HyperlinkId, h.Link);

// ─── Parse caption HTML to extract reference info ────────

function parseCaption(caption: string): { raw: string; articleTitle: string } {
  const eloc = caption.match(/<span class="eloc">(.*?)<\/span>/);
  const etitle = caption.match(/<span class="etitle">(.*?)<\/span>/);
  const raw = eloc ? eloc[1].replace(/<[^>]+>/g, "").trim() : caption.replace(/<[^>]+>/g, "").trim();
  const articleTitle = etitle ? etitle[1].replace(/<[^>]+>/g, "").trim() : "";
  return { raw, articleTitle };
}

// ─── Build lessons ───────────────────────────────────────

const lessons: IndexedLesson[] = [];
let globalOrder = 0;

for (const doc of documents) {
  globalOrder++;
  const dayInfo = dayMap.get(doc.DocumentId) || { day: "Desconocido", dayNumber: 0 };
  
  // Parse lesson key from ContextTitle ("LECCIÓN 3A" → "3A")
  const keyMatch = doc.ContextTitle.match(/LECCIÓN\s+(\S+)/);
  const lessonKey = keyMatch ? keyMatch[1] : doc.ContextTitle;

  // Build extracts
  const docExtracts = extractsByDoc.get(doc.DocumentId) || [];
  const indexedExtracts: IndexedExtract[] = [];

  for (const ex of docExtracts) {
    const { raw, articleTitle } = parseCaption(ex.Caption || "");
    const refPub = refPubMap.get(ex.RefPublicationId);
    
    const ref: IndexedReference = {
      raw,
      type: "wol",
      articleTitle: articleTitle || undefined,
      publicationSymbol: refPub?.Symbol,
      publicationTitle: refPub?.Title,
      year: refPub?.Year,
      issueTag: refPub?.IssueTagNumber,
      mepsDocumentId: ex.RefMepsDocumentId || undefined,
      refParagraphs: ex.RefBeginParagraphOrdinal && ex.RefEndParagraphOrdinal
        ? `${ex.RefBeginParagraphOrdinal}-${ex.RefEndParagraphOrdinal}`
        : undefined,
      link: ex.Link || undefined,
    };

    indexedExtracts.push({
      paragraphOrdinal: ex.BeginParagraphOrdinal,
      caption: raw + (articleTitle ? ` ${articleTitle}` : ""),
      references: [ref],
    });
  }

  // Build bible citations
  const docBibles = bibleCitsByDoc.get(doc.DocumentId) || [];
  const indexedBibles: IndexedBibleCitation[] = [];
  for (const bc of docBibles) {
    indexedBibles.push({
      paragraphOrdinal: bc.ParagraphOrdinal,
      firstVerseId: bc.FirstBibleVerseId,
      lastVerseId: bc.LastBibleVerseId,
      jwpubLink: hyperlinkMap.get(bc.HyperlinkId),
    });
  }

  lessons.push({
    documentId: doc.DocumentId,
    mepsDocumentId: doc.MepsDocumentId,
    lessonKey,
    title: `Lección ${lessonKey} | ${doc.Title}`,
    day: dayInfo.day,
    dayNumber: dayInfo.dayNumber,
    order: globalOrder,
    paragraphCount: doc.ParagraphCount,
    firstPage: doc.FirstPageNumber,
    lastPage: doc.LastPageNumber,
    extracts: indexedExtracts,
    bibleCitations: indexedBibles,
  });
}

// ─── Build final index ───────────────────────────────────

const index: PrecursorIndex = {
  publication: {
    key: pub.Symbol || "pt14",
    title: pub.Title || "Libro de los precursores",
    shortTitle: pub.ShortTitle || "Libro de los precursores",
    language: "es",
    year: pub.Year || 2023,
    sourceHash,
    importedAt: new Date().toISOString(),
    totalLessons: lessons.length,
    totalExtracts: allExtracts.length,
    totalBibleCitations: allBibleCits.length,
  },
  lessons,
};

// ─── Write output ────────────────────────────────────────

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2), "utf-8");

db.close();

console.log("✅ Índice generado:", OUTPUT_FILE);
console.log(`   Lecciones: ${lessons.length}`);
console.log(`   Extractos: ${allExtracts.length}`);
console.log(`   Citas bíblicas: ${allBibleCits.length}`);
console.log(`   Tamaño: ${(Buffer.byteLength(JSON.stringify(index)) / 1024).toFixed(1)} KB`);
