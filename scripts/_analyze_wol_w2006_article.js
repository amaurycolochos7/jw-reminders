const fs = require("fs");
const html = fs.readFileSync(process.env.TEMP + "/wol_w2006_article.html", "utf-8");

function decode(t) { return t.replace(/&mdash;/g,"—").replace(/&ndash;/g,"–").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,c)=>String.fromCharCode(+c)); }

console.log("=== Artículo 2020443 (w20.06 pág. 7) ===");
console.log("HTML length:", html.length);

const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
console.log("Title:", t ? decode(t[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 150)) : "N/A");

const pnums = (html.match(/data-pnum="\d+"/g) || []);
console.log("Total paragraphs:", pnums.length);

// Footnotes
console.log("\n--- FOOTNOTES/NOTES ---");
const groupFn = html.match(/<div[^>]*class="[^"]*group[Ff]ootnote[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
console.log("groupFootnote blocks:", (groupFn || []).length);
if (groupFn) {
  for (let i = 0; i < groupFn.length; i++) {
    const text = decode(groupFn[i].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    console.log(`  [${i+1}] (${text.length} chars): ${text.slice(0, 200)}`);
  }
}

// footnote class (broader)
const fnDivs = html.match(/<div[^>]*class="[^"]*footnote[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
console.log("div.footnote blocks:", (fnDivs || []).length);

// Look for <p class="...fn..."> or footnote markers
const fnPs = html.match(/<p[^>]*class="[^"]*fn[^"]*"[^>]*>([\s\S]*?)<\/p>/gi);
console.log("p.fn blocks:", (fnPs || []).length);
if (fnPs) {
  for (let i = 0; i < Math.min(3, fnPs.length); i++) {
    const text = decode(fnPs[i].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    console.log(`  fn[${i+1}]: ${text.slice(0, 200)}`);
  }
}

// Search for "nota" or "footnote" text in the content
const noteIdx = html.indexOf("groupFootnote");
if (noteIdx >= 0) {
  const chunk = html.slice(noteIdx, noteIdx + 1000);
  const text = decode(chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  console.log("\ngroupFootnote context:", text.slice(0, 300));
}

// Try broader pattern
const allFootnoteContent = html.match(/<div[^>]*id="footnote[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
console.log("\ndiv#footnote:", (allFootnoteContent || []).length);

// Search in raw HTML for "nota" near footnote markers
const footSection = html.indexOf("groupFootnote") >= 0 ? html.slice(html.indexOf("groupFootnote")) : "";
if (footSection) {
  const noteText = decode(footSection.slice(0, 2000).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  console.log("\nFootnote section text:", noteText.slice(0, 400));
}
