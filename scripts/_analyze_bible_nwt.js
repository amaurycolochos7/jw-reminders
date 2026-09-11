const fs = require("fs");
const html = fs.readFileSync(process.env.TEMP + "/wol_bible_nwt_mat6.html", "utf-8");
console.log("=== NWT Mat 6 ===");
console.log("Length:", html.length);

// Search for known verse text
const searches = ["Padre nuestro", "santificado sea tu nombre", "Venga tu Reino", "oren de esta manera"];
for (const s of searches) {
  const idx = html.indexOf(s);
  if (idx >= 0) {
    console.log(`\n"${s}" at ${idx}:`);
    const before = html.slice(Math.max(0, idx - 200), idx);
    const pStart = before.lastIndexOf("<p ");
    if (pStart >= 0) {
      const fullStart = Math.max(0, idx - 200) + pStart;
      const pEnd = html.indexOf("</p>", idx);
      const pTag = html.slice(fullStart, fullStart + 80);
      const text = html.slice(fullStart, pEnd + 4).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      console.log("  Tag:", pTag.slice(0, 80));
      console.log("  Text:", text.slice(0, 250));
    }
  }
}

// Look for data-pid with verse numbers
const allPids = [...html.matchAll(/<p[^>]*id="p(\d+)"[^>]*data-pid="(\d+)"[^>]*>/g)];
console.log("\n\nTotal <p> with id+data-pid:", allPids.length);
// Find the one containing "Padre nuestro"
const padreIdx = html.indexOf("Padre nuestro");
if (padreIdx >= 0) {
  // Find nearest preceding <p with data-pid
  const regionBefore = html.slice(Math.max(0, padreIdx - 1000), padreIdx);
  const pids = [...regionBefore.matchAll(/id="p(\d+)"[^>]*data-pid="(\d+)"/g)];
  if (pids.length > 0) {
    const last = pids[pids.length - 1];
    console.log("\nNearest data-pid before 'Padre nuestro':", "id=p" + last[1], "pid=" + last[2]);
  }
}
