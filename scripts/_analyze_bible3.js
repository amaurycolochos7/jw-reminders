const fs = require("fs");
const html = fs.readFileSync(process.env.TEMP + "/wol_bible_mat6.html", "utf-8");

// Pattern found: href="#v=40:6:9"
const verseRef = '#v=40:6:9';
const idx = html.indexOf(verseRef);
console.log("Found #v=40:6:9 at:", idx);

if (idx >= 0) {
  // Show surrounding context
  console.log("\nHTML context (500 chars around):");
  console.log(html.slice(Math.max(0, idx - 200), idx + 500));
}

// Now look for the verse TEXT — it should be near a data-pid element
// Let's find what's between verse 9 and verse 10
const v9Ref = '#v=40:6:9';
const v10Ref = '#v=40:6:10';
const v9idx = html.indexOf(v9Ref);
const v10idx = html.indexOf(v10Ref);
console.log("\nv9 index:", v9idx, "v10 index:", v10idx);

if (v9idx >= 0 && v10idx > v9idx) {
  // The verse text is between these markers (in the body section, not the index)
  // But wait - these might be in a TOC/index section. Let's look for a second occurrence
  const v9second = html.indexOf(v9Ref, v9idx + 1);
  console.log("Second v9 occurrence:", v9second);
  
  // Look for a pattern that marks the verse body text
  // Check for data-pid near verse 9
  const bodySection = html.slice(v9idx + 20);
  const nextDataPid = bodySection.indexOf("data-pid");
  console.log("Next data-pid after v9:", nextDataPid >= 0 ? v9idx + 20 + nextDataPid : -1);
}

// Try to find actual verse content by looking at the structure
// WOL Bible typically uses <p id="pN" data-pid="N"> for verses
// Let's look for the verse body by finding id="p" elements that correspond to verse numbers
// The verseItem links are likely a navigation panel, the actual text is in <p> elements

// Search for text "Ustedes" near verse 9 (known text of Mateo 6:9 in NWT Spanish)
const ustedesIdx = html.indexOf("Ustedes");
console.log("\n'Ustedes' at:", ustedesIdx);
if (ustedesIdx >= 0) {
  console.log("Context:", html.slice(ustedesIdx - 100, ustedesIdx + 300).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200));
}

// Search for "oren" (from "oren así")
const orenIdx = html.indexOf("oren");
console.log("'oren' at:", orenIdx);
if (orenIdx >= 0) {
  console.log("Context:", html.slice(Math.max(0, orenIdx - 50), orenIdx + 200).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200));
}
