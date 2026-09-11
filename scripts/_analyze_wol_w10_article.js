const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(process.env.TEMP, "wol_w10_article.html"), "utf-8");

function decode(t) { return t.replace(/&mdash;/g,"—").replace(/&ndash;/g,"–").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,c)=>String.fromCharCode(+c)); }

console.log("=== Artículo 2010524 (w10 15/7) ===");
console.log("HTML length:", html.length);

// Title
const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
if (h1) console.log("Title:", decode(h1[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()));

// Paragraphs
const pnums = (html.match(/data-pnum="\d+"/g) || []);
console.log("Total paragraphs:", pnums.length);

// ALL classes in the page
const classMatches = html.match(/class="[^"]+"/g) || [];
const uniqueClasses = [...new Set(classMatches.map(c => c.replace(/class="/, "").replace(/"$/, "")))];
const boxClasses = uniqueClasses.filter(c => /box|aside|supplement|callout|highlight/i.test(c));
console.log("\nBox-related classes:", boxClasses.length);
for (const c of boxClasses.slice(0, 15)) console.log("  " + c);

// Look for any <aside> or <figure> or special divs
console.log("\n<aside> count:", (html.match(/<aside/g) || []).length);
console.log("<figure> count:", (html.match(/<figure/g) || []).length);

// Try broader pattern for boxes
const boxDiv = html.match(/<div[^>]*class="[^"]*box[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi);
console.log("div.box matches:", (boxDiv || []).length);

// Extract all sections with specific class patterns used by WOL
const duColorMatches = html.match(/class="[^"]*du-color[^"]*"/g);
if (duColorMatches) console.log("\ndu-color classes:", [...new Set(duColorMatches)].slice(0, 10));

// Try to find the "recuadro" by looking at the content structure around page 22
// The article spans pages - let's look for boxContent or ruleAbove patterns
const ruleAbove = html.match(/<div[^>]*class="[^"]*rule[^"]*"[^>]*>/gi);
console.log("div.rule matches:", (ruleAbove || []).length);

// Last resort: look for any block that contains key words indicating a box
const blockquoteCount = (html.match(/<blockquote/gi) || []).length;
console.log("<blockquote> count:", blockquoteCount);

// Search for "boxSupplement" class which WOL commonly uses
const supplementIdx = html.indexOf("boxSupplement");
if (supplementIdx >= 0) {
  console.log("\n>>> boxSupplement found at index:", supplementIdx);
  const chunk = html.slice(supplementIdx, supplementIdx + 2000);
  const text = decode(chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  console.log("Content (first 200):", text.slice(0, 200));
}
