const fs = require("fs");
const html = fs.readFileSync(process.env.TEMP + "/wol_bible_mat6.html", "utf-8");

console.log("=== WOL Bible - Mateo 6 ===");
console.log("HTML length:", html.length);

// Check for verse ID patterns
const verseId9 = 'id="v40-6-9"';
const idx9 = html.indexOf(verseId9);
console.log("Found v40-6-9:", idx9 >= 0, "at:", idx9);

const verseId10 = 'id="v40-6-10"';
const idx10 = html.indexOf(verseId10);
console.log("Found v40-6-10:", idx10 >= 0, "at:", idx10);

// Extract verse 9
if (idx9 >= 0) {
  const chunk = idx10 > idx9 ? html.slice(idx9, idx10) : html.slice(idx9, idx9 + 1000);
  const text = chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().replace(/^\d+\s*/, "");
  console.log("\nMateo 6:9 text:", text.slice(0, 300));
  console.log("Length:", text.length);
}

// Also try Sal 83:18 pattern
const sal83idx = html.indexOf("v19-83-18");
console.log("\nSal 83:18 in this file?", sal83idx >= 0); // Won't be here since this is Mat 6

// Check for other verse pattern markers
const patterns = ["data-pid", 'class="vn"', 'class="v"', 'class="b"'];
for (const p of patterns) {
  const count = (html.match(new RegExp(p, "g")) || []).length;
  if (count > 0) console.log("Pattern '" + p + "':", count);
}

// Also check Rev 21 to confirm the format
console.log("\n=== Check verse format ===");
// Let's look at how verse 9 is structured in the raw HTML
if (idx9 >= 0) {
  console.log("\nRaw HTML around v40-6-9 (200 chars):");
  console.log(html.slice(idx9, idx9 + 400));
}
