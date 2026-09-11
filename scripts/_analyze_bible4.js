const fs = require("fs");
const html = fs.readFileSync(process.env.TEMP + "/wol_bible_mat6.html", "utf-8");

// The verse body text uses pattern like:
// <span ... class="vl vx vp">VERSE_NUMBER CONTENT</span>
// or the verse number is in a <span class="verseNum"> type element

// Let's search for verse 9 text. In NWT Spanish, Mateo 6:9 starts with:
// "Ustedes, pues, oren así: 'Padre nuestro que estás en los cielos, santificado sea tu nombre."
// But from the context above, it seems the text is at index ~231721 area

// Let's look for all <p ... data-pid="..."> elements in the verse region (after index 230000)
const verseRegion = html.slice(40000, 110000); // Body area
const pidElements = [...verseRegion.matchAll(/<p[^>]*id="p(\d+)"[^>]*data-pid="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi)];
console.log("p elements with data-pid in body area:", pidElements.length);

// Show first 5 to understand structure
for (const m of pidElements.slice(0, 5)) {
  const text = m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log(`  p#${m[1]} pid=${m[2]}: ${text.slice(0, 100)}`);
}

// Now try to find verse 9 by looking at content
// The verse text will start with verse number "9" or contain "oren así"
console.log("\n--- Searching for verse 9 text ---");
for (const m of pidElements) {
  const text = m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.match(/^\s*9\s/) || text.includes("oren así") || text.includes("Padre nuestro")) {
    console.log(`  FOUND! p#${m[1]} pid=${m[2]}: ${text.slice(0, 200)}`);
  }
}

// Try a different approach: look for <span class="..."> containing just the number 9
// followed by verse text
const verseNumPattern = />\s*9\s*<\/span[^>]*>\s*([^<]+)/g;
const bodyHtml = html.slice(40000, 110000);
let match;
let count = 0;
while ((match = verseNumPattern.exec(bodyHtml)) !== null && count < 5) {
  if (match[1].trim().length > 20) {
    console.log(`\nVerse num 9 followed by: ${match[1].slice(0, 150)}`);
    count++;
  }
}
