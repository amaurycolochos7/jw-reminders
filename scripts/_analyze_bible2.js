const fs = require("fs");
const html = fs.readFileSync(process.env.TEMP + "/wol_bible_mat6.html", "utf-8");

// Look for verse number patterns
// Try: class="vn" (verse number)
const vnMatches = html.match(/class="[^"]*vn[^"]*"[^>]*>[^<]+</g) || [];
console.log("class~vn matches:", vnMatches.length);
if (vnMatches.length > 0) console.log("  Samples:", vnMatches.slice(0, 5));

// Look for verse markers with numbers
const verseMarkers = html.match(/class="v[^"]*"[^>]*>\s*\d+/g) || [];
console.log("\nclass~v + number:", verseMarkers.length);
if (verseMarkers.length > 0) console.log("  Samples:", verseMarkers.slice(0, 5));

// Look for spans with verse numbers like <span class="vN">9</span>
const vnSpans = html.match(/<span[^>]*class="[^"]*v[^"]*"[^>]*>\d+<\/span>/g) || [];
console.log("\n<span class~v>N</span>:", vnSpans.length);
if (vnSpans.length > 0) console.log("  Samples:", vnSpans.slice(0, 10));

// data-pid around verse 9 area
// First let's find where "9" appears as verse number
// Search for "9 " after typical verse markup
const nineIdx = html.indexOf(">9\u00a0"); // 9 + non-breaking space
const nineIdx2 = html.indexOf(">9 ");
const nineIdx3 = html.indexOf(">9</");
console.log("\n>9\\xa0 at:", nineIdx);
console.log(">9 at:", nineIdx2);
console.log(">9</ at:", nineIdx3);

// Get surrounding context
if (nineIdx >= 0) {
  console.log("\nContext around >9\\xa0:");
  console.log(html.slice(Math.max(0, nineIdx - 100), nineIdx + 300));
}

// Try to find verse container with id
const idPattern = html.match(/id="p\d+"/g) || [];
console.log("\nid=pN patterns:", idPattern.length);
if (idPattern.length > 0) console.log("  First 10:", idPattern.slice(0, 10));

// Look for data-pid values
const pidValues = html.match(/data-pid="(\d+)"/g) || [];
console.log("\ndata-pid values (first 10):", pidValues.slice(0, 10));
