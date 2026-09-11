// Analizar el HTML de WOL guardado
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(process.env.TEMP, "wol_w13.html"), "utf-8");

console.log("=== ANÁLISIS DE /wol/l/ para w13 15/7 págs. 20-25 ===");
console.log("HTML length:", html.length);

// Title
const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
if (titleMatch) {
  const title = titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  console.log("Title:", title);
}

// Is article page?
console.log("Has data-pid:", html.includes("data-pid"));
console.log("Has data-pnum:", html.includes("data-pnum"));

// Article links
const links = [...new Set((html.match(/\/es\/wol\/d\/r4\/lp-s\/\d+/g) || []))];
console.log("Unique article links:", links.length);
for (const l of links.slice(0, 10)) {
  console.log("  https://wol.jw.org" + l);
}

// If it IS an article page, extract paragraphs
if (html.includes("data-pnum")) {
  const pnumMatches = html.match(/data-pnum="\d+"/g) || [];
  console.log("\ndata-pnum values found:", pnumMatches.length);
  console.log("  ", pnumMatches.slice(0, 10).join(", "));
  
  // Extract first paragraph with data-pnum
  const pnumIdx = html.indexOf('data-pnum="1"');
  if (pnumIdx > 0) {
    const before = html.slice(Math.max(0, pnumIdx - 300), pnumIdx);
    const pStart = before.lastIndexOf("<p");
    if (pStart >= 0) {
      const fullStart = Math.max(0, pnumIdx - 300) + pStart;
      const pEnd = html.indexOf("</p>", pnumIdx);
      if (pEnd > 0) {
        const pHtml = html.slice(fullStart, pEnd + 4);
        const text = pHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        console.log("\nPárrafo 1 (first 150 chars):", text.slice(0, 150));
      }
    }
  }
}

// Check if it's a search results page
if (!html.includes("data-pnum") && links.length > 0) {
  console.log("\n>>> Esta es una PÁGINA DE RESULTADOS, no un artículo directo.");
  console.log(">>> Candidatos a abrir:", links.length);
}
