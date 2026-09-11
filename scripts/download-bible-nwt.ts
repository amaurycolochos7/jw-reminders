/**
 * Bible NWT Downloader
 * 
 * Descarga todos los versículos de la Biblia Traducción del Nuevo Mundo (español)
 * desde WOL y genera un JSON local completo.
 * 
 * Output: data/bible/nwt_S.json
 * 
 * Run: npx tsx scripts/download-bible-nwt.ts
 * 
 * Estimated time: ~20-30 min (1189 chapters, rate limited)
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";

const OUTPUT_DIR = resolve(__dirname, "../data/bible");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "nwt_S.json");
const PROGRESS_FILE = resolve(OUTPUT_DIR, "_progress.json");

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Bible book definitions ──────────────────────────────

const BOOKS = [
  { num: 1, name: "Génesis", chapters: 50 },
  { num: 2, name: "Éxodo", chapters: 40 },
  { num: 3, name: "Levítico", chapters: 27 },
  { num: 4, name: "Números", chapters: 36 },
  { num: 5, name: "Deuteronomio", chapters: 34 },
  { num: 6, name: "Josué", chapters: 24 },
  { num: 7, name: "Jueces", chapters: 21 },
  { num: 8, name: "Rut", chapters: 4 },
  { num: 9, name: "1 Samuel", chapters: 31 },
  { num: 10, name: "2 Samuel", chapters: 24 },
  { num: 11, name: "1 Reyes", chapters: 22 },
  { num: 12, name: "2 Reyes", chapters: 25 },
  { num: 13, name: "1 Crónicas", chapters: 29 },
  { num: 14, name: "2 Crónicas", chapters: 36 },
  { num: 15, name: "Esdras", chapters: 10 },
  { num: 16, name: "Nehemías", chapters: 13 },
  { num: 17, name: "Ester", chapters: 10 },
  { num: 18, name: "Job", chapters: 42 },
  { num: 19, name: "Salmos", chapters: 150 },
  { num: 20, name: "Proverbios", chapters: 31 },
  { num: 21, name: "Eclesiastés", chapters: 12 },
  { num: 22, name: "Cantar de los Cantares", chapters: 8 },
  { num: 23, name: "Isaías", chapters: 66 },
  { num: 24, name: "Jeremías", chapters: 52 },
  { num: 25, name: "Lamentaciones", chapters: 5 },
  { num: 26, name: "Ezequiel", chapters: 48 },
  { num: 27, name: "Daniel", chapters: 12 },
  { num: 28, name: "Oseas", chapters: 14 },
  { num: 29, name: "Joel", chapters: 3 },
  { num: 30, name: "Amós", chapters: 9 },
  { num: 31, name: "Abdías", chapters: 1 },
  { num: 32, name: "Jonás", chapters: 4 },
  { num: 33, name: "Miqueas", chapters: 7 },
  { num: 34, name: "Nahúm", chapters: 3 },
  { num: 35, name: "Habacuc", chapters: 3 },
  { num: 36, name: "Sofonías", chapters: 3 },
  { num: 37, name: "Ageo", chapters: 2 },
  { num: 38, name: "Zacarías", chapters: 14 },
  { num: 39, name: "Malaquías", chapters: 4 },
  { num: 40, name: "Mateo", chapters: 28 },
  { num: 41, name: "Marcos", chapters: 16 },
  { num: 42, name: "Lucas", chapters: 24 },
  { num: 43, name: "Juan", chapters: 21 },
  { num: 44, name: "Hechos", chapters: 28 },
  { num: 45, name: "Romanos", chapters: 16 },
  { num: 46, name: "1 Corintios", chapters: 16 },
  { num: 47, name: "2 Corintios", chapters: 13 },
  { num: 48, name: "Gálatas", chapters: 6 },
  { num: 49, name: "Efesios", chapters: 6 },
  { num: 50, name: "Filipenses", chapters: 4 },
  { num: 51, name: "Colosenses", chapters: 4 },
  { num: 52, name: "1 Tesalonicenses", chapters: 5 },
  { num: 53, name: "2 Tesalonicenses", chapters: 3 },
  { num: 54, name: "1 Timoteo", chapters: 6 },
  { num: 55, name: "2 Timoteo", chapters: 4 },
  { num: 56, name: "Tito", chapters: 3 },
  { num: 57, name: "Filemón", chapters: 1 },
  { num: 58, name: "Hebreos", chapters: 13 },
  { num: 59, name: "Santiago", chapters: 5 },
  { num: 60, name: "1 Pedro", chapters: 5 },
  { num: 61, name: "2 Pedro", chapters: 3 },
  { num: 62, name: "1 Juan", chapters: 5 },
  { num: 63, name: "2 Juan", chapters: 1 },
  { num: 64, name: "3 Juan", chapters: 1 },
  { num: 65, name: "Judas", chapters: 1 },
  { num: 66, name: "Revelación", chapters: 22 },
];

const TOTAL_CHAPTERS = BOOKS.reduce((s, b) => s + b.chapters, 0);

// ─── HTML decode helper ──────────────────────────────────

function decode(text: string): string {
  return text
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)));
}

// ─── Fetch with retry ────────────────────────────────────

async function fetchChapter(bookNum: number, chapter: number): Promise<string | null> {
  const url = `https://wol.jw.org/es/wol/b/r4/lp-s/nwt/${bookNum}/${chapter}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept-Language": "es",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        if (attempt < 2) { await delay(3000); continue; }
        return null;
      }
      return await res.text();
    } catch {
      if (attempt < 2) await delay(3000);
    }
  }
  return null;
}

// ─── Extract verses from chapter HTML ────────────────────

interface Verse {
  number: number;
  text: string;
}

function extractVerses(html: string, bookNum: number, chapter: number): Verse[] {
  const verses: Verse[] = [];
  
  // Pattern: <span id="v{bookNum}-{chapter}-{verse}(-{sub})?" class="v">
  // Content follows until next verse marker or end of block
  const verseRegex = new RegExp(
    `id="v${bookNum}-${chapter}-(\\d+)(?:-\\d+)?"\\s+class="v"`,
    "gi"
  );
  
  const seenVerses = new Set<number>();
  let match;
  
  while ((match = verseRegex.exec(html)) !== null) {
    const vNum = parseInt(match[1], 10);
    if (seenVerses.has(vNum)) continue; // Skip duplicate sub-parts
    seenVerses.add(vNum);
    
    // Advance past the closing ">" of the span tag
    const tagClose = html.indexOf(">", match.index + match[0].length);
    const startIdx = tagClose >= 0 ? tagClose + 1 : match.index + match[0].length;
    
    // Find next verse marker
    const nextRegex = new RegExp(
      `id="v${bookNum}-${chapter}-(${vNum + 1})(?:-\\d+)?"\\s+class="v"`,
      "i"
    );
    const nextMatch = nextRegex.exec(html.slice(startIdx));
    const endIdx = nextMatch ? startIdx + nextMatch.index : startIdx + 3000;
    
    // Extract and clean text
    const verseHtml = html.slice(startIdx, Math.min(endIdx, startIdx + 3000));
    let text = decode(
      verseHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );
    // Remove leading verse number and footnote markers, trailing incomplete tags
    text = text.replace(/^\d+\s*/, "").replace(/[*†+]+\s*/g, "").replace(/\s*<[^>]*$/, "").trim();
    
    if (text.length > 0) {
      verses.push({ number: vNum, text });
    }
  }
  
  return verses.sort((a, b) => a.number - b.number);
}

// ─── Progress tracking ───────────────────────────────────

interface Progress {
  completedChapters: string[]; // "bookNum:chapter"
  lastBookNum: number;
  lastChapter: number;
}

function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  }
  return { completedChapters: [], lastBookNum: 0, lastChapter: 0 };
}

function saveProgress(progress: Progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress), "utf-8");
}

// ─── Main ────────────────────────────────────────────────

interface BibleChapter {
  chapter: number;
  verses: Verse[];
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

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Bible NWT Spanish — Download from WOL      ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`Total: ${BOOKS.length} books, ${TOTAL_CHAPTERS} chapters\n`);

  const progress = loadProgress();
  const completedSet = new Set(progress.completedChapters);
  
  // Load existing data if resuming
  let bibleData: BibleData;
  if (existsSync(OUTPUT_FILE) && completedSet.size > 0) {
    bibleData = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
    console.log(`Resuming from progress: ${completedSet.size}/${TOTAL_CHAPTERS} chapters done\n`);
  } else {
    bibleData = {
      translation: "nwt",
      language: "es",
      generatedAt: new Date().toISOString(),
      totalBooks: 66,
      totalChapters: TOTAL_CHAPTERS,
      totalVerses: 0,
      books: [],
    };
  }

  let chaptersProcessed = completedSet.size;
  let totalVerses = bibleData.books.reduce((s, b) => s + b.chapters.reduce((s2, c) => s2 + c.verses.length, 0), 0);

  for (const book of BOOKS) {
    // Find or create book in data
    let bookData = bibleData.books.find(b => b.number === book.num);
    if (!bookData) {
      bookData = { number: book.num, name: book.name, chapters: [] };
      bibleData.books.push(bookData);
    }

    for (let ch = 1; ch <= book.chapters; ch++) {
      const key = `${book.num}:${ch}`;
      if (completedSet.has(key)) continue;

      // Fetch chapter
      const html = await fetchChapter(book.num, ch);
      if (!html) {
        console.log(`  ❌ Failed: ${book.name} ${ch}`);
        continue;
      }

      // Extract verses
      const verses = extractVerses(html, book.num, ch);
      
      // Add to book data
      bookData.chapters.push({ chapter: ch, verses });
      totalVerses += verses.length;
      chaptersProcessed++;

      // Update progress
      completedSet.add(key);
      progress.completedChapters.push(key);
      progress.lastBookNum = book.num;
      progress.lastChapter = ch;

      // Status
      const pct = ((chaptersProcessed / TOTAL_CHAPTERS) * 100).toFixed(1);
      process.stdout.write(`\r  ${book.name} ${ch}/${book.chapters} — ${verses.length} verses — ${pct}% (${chaptersProcessed}/${TOTAL_CHAPTERS})`);

      // Save every 10 chapters
      if (chaptersProcessed % 10 === 0) {
        bibleData.totalVerses = totalVerses;
        bibleData.generatedAt = new Date().toISOString();
        writeFileSync(OUTPUT_FILE, JSON.stringify(bibleData), "utf-8");
        saveProgress(progress);
      }

      // Rate limiting: 800ms between requests
      await delay(800);
    }
    
    console.log(`\n  ✅ ${book.name} complete (${bookData.chapters.length} chapters)`);
  }

  // Final save
  bibleData.totalVerses = totalVerses;
  bibleData.generatedAt = new Date().toISOString();
  // Sort books and chapters
  bibleData.books.sort((a, b) => a.number - b.number);
  for (const book of bibleData.books) {
    book.chapters.sort((a, b) => a.chapter - b.chapter);
  }
  writeFileSync(OUTPUT_FILE, JSON.stringify(bibleData, null, 0), "utf-8");
  saveProgress(progress);

  const sizeMB = (Buffer.byteLength(JSON.stringify(bibleData)) / 1024 / 1024).toFixed(1);
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  ✅ COMPLETE                                  ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log(`Books: ${bibleData.books.length}`);
  console.log(`Chapters: ${chaptersProcessed}`);
  console.log(`Verses: ${totalVerses}`);
  console.log(`File: ${OUTPUT_FILE}`);
  console.log(`Size: ${sizeMB} MB`);
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
