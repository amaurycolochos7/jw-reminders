const fs = require("fs");

// Simulate BibleWolResolver logic
const BIBLE_BOOK_NUMBERS = {
  "Mateo": 40, "Salmos": 19, "Revelación": 66,
};

function decode(t) { return t.replace(/&mdash;/g,"—").replace(/&ndash;/g,"–").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,c)=>String.fromCharCode(+c)); }

function parseVerseNumbers(verses) {
  const result = [];
  const parts = verses.split(/\s*,\s*/);
  for (const part of parts) {
    if (part.includes("-") || part.includes("–")) {
      const [a, b] = part.split(/[-–]/).map(s => parseInt(s.trim(), 10));
      for (let i = a; i <= b; i++) result.push(i);
    } else {
      result.push(parseInt(part.trim(), 10));
    }
  }
  return result;
}

async function resolveBible(book, chapter, verses) {
  const bookNumber = BIBLE_BOOK_NUMBERS[book];
  const url = `https://wol.jw.org/es/wol/b/r4/lp-s/nwt/${bookNumber}/${chapter}`;
  
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept-Language": "es" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
  const html = await res.text();
  
  const verseNumbers = parseVerseNumbers(verses);
  const extractedContent = [];
  
  for (const vNum of verseNumbers) {
    const verseMarkerRegex = new RegExp(`id="v${bookNumber}-${chapter}-${vNum}(?:-\\d+)?"\\s+class="v"`, "i");
    const markerMatch = verseMarkerRegex.exec(html);
    if (!markerMatch) { console.log(`  Verse ${vNum}: marker NOT found`); continue; }
    
    // Advance past closing ">" of the span tag
    const tagCloseIdx = html.indexOf(">", markerMatch.index + markerMatch[0].length);
    const startIdx = tagCloseIdx >= 0 ? tagCloseIdx + 1 : markerMatch.index + markerMatch[0].length;
    
    const nextVerseRegex = new RegExp(`id="v${bookNumber}-${chapter}-${vNum + 1}(?:-\\d+)?"\\s+class="v"`, "i");
    const nextMatch = nextVerseRegex.exec(html.slice(startIdx));
    const endIdx = nextMatch ? startIdx + nextMatch.index : startIdx + 2000;
    
    const verseHtml = html.slice(startIdx, Math.min(endIdx, startIdx + 2000));
    let text = decode(verseHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    text = text.replace(/^\d+\s*/, "").replace(/[*†+]+\s*/g, "").replace(/\s*<[^>]*$/, "").trim();
    
    if (text.length > 5) {
      extractedContent.push({ label: `${book} ${chapter}:${vNum}`, verseNumber: vNum, text, textLength: text.length });
    }
  }
  
  return {
    type: "bible",
    reference: `${book} ${chapter}:${verses}`,
    status: extractedContent.length > 0 ? "resolved" : "extraction_failed",
    url,
    urlType: "direct",
    translation: "Traducción del Nuevo Mundo",
    book, bookNumber, chapter, verses,
    extractedContent,
    totalTextLength: extractedContent.reduce((s, v) => s + v.textLength, 0),
  };
}

async function main() {
  console.log("═══ BibleWolResolver Tests ═══\n");
  
  // Test 1: Mateo 6:9
  console.log("--- Mateo 6:9 ---");
  const r1 = await resolveBible("Mateo", 6, "9");
  console.log(JSON.stringify(r1, null, 2));
  
  // Test 2: Salmos 83:18
  console.log("\n--- Salmos 83:18 ---");
  const r2 = await resolveBible("Salmos", 83, "18");
  console.log(JSON.stringify(r2, null, 2));
  
  // Test 3: Revelación 21:3, 4
  console.log("\n--- Revelación 21:3, 4 ---");
  const r3 = await resolveBible("Revelación", 21, "3, 4");
  console.log(JSON.stringify(r3, null, 2));
}

main().catch(console.error);
