// Extrae resumen completo del artículo WOL resuelto
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(process.env.TEMP, "wol_w13.html"), "utf-8");

function decodeEntities(text) {
  return text.replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c));
}

// Extract real title from article content (not the search page title)
const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
const articleTitle = h1Match ? decodeEntities(h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()) : "N/A";

// Extract all paragraphs with data-pnum
const allParagraphs = [];
const pnumRegex = /data-pnum="(\d+)"/g;
let match;
while ((match = pnumRegex.exec(html)) !== null) {
  const pNum = parseInt(match[1], 10);
  const pnumIdx = match.index;
  
  // Find the <p...> that contains this data-pnum
  const before = html.slice(Math.max(0, pnumIdx - 400), pnumIdx);
  const pStart = before.lastIndexOf("<p");
  if (pStart >= 0) {
    const fullStart = Math.max(0, pnumIdx - 400) + pStart;
    const pEnd = html.indexOf("</p>", pnumIdx);
    if (pEnd > 0) {
      const pHtml = html.slice(fullStart, pEnd + 4);
      let text = decodeEntities(pHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      // Remove leading paragraph number
      text = text.replace(new RegExp("^" + pNum + "\\s+"), "");
      if (text.length > 10) {
        allParagraphs.push({ label: "Párrafo " + pNum, paragraphNumber: pNum, textLength: text.length, first120: text.slice(0, 120), last120: text.slice(-120) });
      }
    }
  }
}

// Build final evidence
const result = {
  raw: "w13 15/7 págs. 20-25",
  endpointUsed: "/wol/l/",
  urlConsulted: "https://wol.jw.org/es/wol/l/r4/lp-s?q=w13+15%2F7+p%C3%A1gs.+20-25",
  wolResponse: "Artículo directo (la página ya contiene data-pnum)",
  candidatesFound: ["https://wol.jw.org/es/wol/d/r4/lp-s/2013533"],
  selectedArticleUrl: "https://wol.jw.org/es/wol/d/r4/lp-s/2013533",
  title: articleTitle,
  publication: "La Atalaya, 15 de julio de 2013",
  status: "resolved",
  urlType: "direct",
  paragraphsExtracted: allParagraphs.length,
  totalTextLength: allParagraphs.reduce((s, p) => s + p.textLength, 0),
  extractedContentSummary: allParagraphs.slice(0, 5),
  lastParagraph: allParagraphs[allParagraphs.length - 1] || null,
  hasBox: html.includes("boxSupplement") || html.includes("<aside"),
  hasNote: html.includes("groupFootnote") || html.includes("footnote"),
};

console.log(JSON.stringify(result, null, 2));
