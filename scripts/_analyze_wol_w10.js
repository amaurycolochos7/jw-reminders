const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(process.env.TEMP, "wol_w10.html"), "utf-8");

function decode(t) { return t.replace(/&mdash;/g,"—").replace(/&ndash;/g,"–").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,c)=>String.fromCharCode(+c)); }

console.log("=== w10 15/7 pág. 22, recuadro ===");
console.log("HTML length:", html.length);
console.log("Has data-pnum:", html.includes("data-pnum"));
console.log("Has data-pid:", html.includes("data-pid"));

// Links
const links = [...new Set((html.match(/\/es\/wol\/d\/r4\/lp-s\/\d+/g) || []))];
console.log("Article links:", links.length);
for (const l of links.slice(0, 5)) console.log("  https://wol.jw.org" + l);

// Is it an article directly?
if (html.includes("data-pnum")) {
  console.log("\n>>> ARTÍCULO DIRECTO");
  const pnums = (html.match(/data-pnum="\d+"/g) || []);
  console.log("Paragraphs:", pnums.length);
}

// Look for boxes
console.log("\n--- RECUADROS ---");
const boxPatterns = [
  { name: "boxSupplement", regex: /<div[^>]*class="[^"]*boxSupplement[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>|$)/gi },
  { name: "du-color--gold (box)", regex: /<div[^>]*class="[^"]*du-color--gold[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>|$)/gi },
  { name: "aside", regex: /<aside[^>]*>([\s\S]*?)<\/aside>/gi },
  { name: "boxContent", regex: /<div[^>]*class="[^"]*boxContent[^"]*"[^>]*>([\s\S]*?)<\/div>/gi },
];

for (const pat of boxPatterns) {
  const matches = [...html.matchAll(pat.regex)];
  if (matches.length > 0) {
    console.log(`  Pattern "${pat.name}": ${matches.length} match(es)`);
    for (let i = 0; i < Math.min(3, matches.length); i++) {
      const text = decode(matches[i][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      console.log(`    [${i+1}] (${text.length} chars) first120: ${text.slice(0, 120)}`);
      if (text.length > 120) console.log(`        last120: ${text.slice(-120)}`);
    }
  }
}

// Check for article title (h1)
const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
if (h1) console.log("\nArticle H1:", decode(h1[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()));

// Notes
console.log("\n--- NOTAS ---");
const noteMatch = html.match(/<div[^>]*class="[^"]*(?:groupFootnote|footnote)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
console.log("Footnotes found:", (noteMatch || []).length);
