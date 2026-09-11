const fs = require("fs");
const html = fs.readFileSync(process.env.TEMP + "/wol_bible_mat6.html", "utf-8");

// Search the ENTIRE HTML for patterns that contain verse text
// WOL Bible likely has the actual scripture in a specific section

// Pattern: Look for a <p> that contains "oren así" (which is Mateo 6:9 NWT Spanish)
const orenIdx = html.indexOf("oren as");
console.log("'oren as' at:", orenIdx);

if (orenIdx >= 0) {
  // Go backwards to find the opening <p> tag
  const before = html.slice(Math.max(0, orenIdx - 500), orenIdx);
  const pStart = before.lastIndexOf("<p ");
  console.log("Opening <p at:", pStart >= 0 ? "found" : "not found");
  
  if (pStart >= 0) {
    const fullStart = Math.max(0, orenIdx - 500) + pStart;
    const pEnd = html.indexOf("</p>", orenIdx);
    const pHtml = html.slice(fullStart, pEnd + 4);
    console.log("\nFull <p> tag (first 100):", pHtml.slice(0, 100));
    
    // Extract id and data-pid
    const idMatch = pHtml.match(/id="([^"]+)"/);
    const pidMatch = pHtml.match(/data-pid="([^"]+)"/);
    console.log("id:", idMatch ? idMatch[1] : "N/A");
    console.log("data-pid:", pidMatch ? pidMatch[1] : "N/A");
    
    // Full text
    const text = pHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.log("\nFull verse paragraph text:");
    console.log(text);
    console.log("Length:", text.length);
  }
}

// Let's also find verse 10
const v10text = html.indexOf("Venga tu Reino");
console.log("\n\n'Venga tu Reino' at:", v10text);
if (v10text >= 0) {
  const before = html.slice(Math.max(0, v10text - 500), v10text);
  const pStart = before.lastIndexOf("<p ");
  if (pStart >= 0) {
    const fullStart = Math.max(0, v10text - 500) + pStart;
    const pEnd = html.indexOf("</p>", v10text);
    const pHtml = html.slice(fullStart, pEnd + 4);
    const pidMatch = pHtml.match(/data-pid="([^"]+)"/);
    const text = pHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.log("data-pid:", pidMatch ? pidMatch[1] : "N/A");
    console.log("Verse 10 text:", text.slice(0, 200));
  }
}

// Let's check: are there sequential data-pid values that correspond to verse numbers?
// Find all <p> with data-pid in the scripture text section
const scriptureSection = html.slice(190000, 240000);
const verseParagraphs = [...scriptureSection.matchAll(/<p[^>]*data-pid="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)];
console.log("\n\nAll <p data-pid> in scripture section (190k-240k):", verseParagraphs.length);
for (const m of verseParagraphs.slice(0, 15)) {
  const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > 10) {
    console.log(`  pid=${m[1]}: ${text.slice(0, 120)}`);
  }
}
