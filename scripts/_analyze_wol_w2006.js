const fs = require("fs");
const html = fs.readFileSync(process.env.TEMP + "/wol_w2006.html", "utf-8");
console.log("=== w20.06 pág. 7, nota ===");
console.log("HTML length:", html.length);
const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
console.log("Title:", t ? t[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 150) : "N/A");
console.log("Has data-pnum:", html.includes("data-pnum"));

const links = [...new Set((html.match(/\/es\/wol\/d\/r4\/lp-s\/\d+/g) || []))];
console.log("Article links:", links.length);
for (const l of links.slice(0, 5)) console.log("  https://wol.jw.org" + l);

// Search for footnote patterns
const fnPatterns = ["groupFootnote", "footnote", "fn-", "foot", "note"];
for (const pat of fnPatterns) {
  const count = (html.match(new RegExp(pat, "gi")) || []).length;
  if (count > 0) console.log("Pattern '" + pat + "':", count, "occurrences");
}

// Extract any footnote content
const fnMatch = html.match(/<div[^>]*class="[^"]*(?:groupFootnote|footnote)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
if (fnMatch) {
  const text = fnMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log("\nFootnote content (first 200):", text.slice(0, 200));
}

// Also check for footnote markers like * or †
const fnMarker = html.match(/class="[^"]*fn[^"]*"/gi);
if (fnMarker) console.log("\nfn classes:", [...new Set(fnMarker)].slice(0, 5));
