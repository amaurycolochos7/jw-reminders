const Database = require("better-sqlite3");
const DB_PATH = "C:/Users/Amaury/AppData/Local/Packages/WatchtowerBibleandTractSo.45909CDBADF3C_5rz59y55nfz3e/LocalState/Publications/nwtsty_S/nwtsty_S.db";

const db = new Database(DB_PATH, { readonly: true });

// Tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log("=== TABLES ===");
console.log(tables.map(t => t.name).join(", "));
console.log("Total:", tables.length);

// Check each important table
const important = ["BibleVerse", "BibleBook", "Document", "Footnote", "Extract", "DocumentParagraph"];
for (const tbl of important) {
  const exists = tables.find(t => t.name === tbl);
  if (!exists) { console.log("\n" + tbl + ": NOT FOUND"); continue; }
  
  const count = db.prepare("SELECT COUNT(*) as c FROM " + tbl).get();
  const cols = db.prepare("PRAGMA table_info(" + tbl + ")").all();
  console.log("\n=== " + tbl + " (" + count.c + " rows) ===");
  console.log("Cols:", cols.map(c => c.name).join(", "));
  
  const sample = db.prepare("SELECT * FROM " + tbl + " LIMIT 3").all();
  for (const row of sample) {
    const s = {};
    for (const [k, v] of Object.entries(row)) {
      if (Buffer.isBuffer(v)) s[k] = "[BLOB " + v.length + "B]";
      else if (typeof v === "string" && v.length > 80) s[k] = v.slice(0, 80) + "...";
      else s[k] = v;
    }
    console.log("  ", JSON.stringify(s));
  }
}

// Check Document for Bible chapters - find Mateo 6
const mateo6 = db.prepare("SELECT DocumentId, Title, ContextTitle FROM Document WHERE Title LIKE '%Mateo%6%' OR ContextTitle LIKE '%Mateo%' LIMIT 10").all();
console.log("\n=== Mateo 6 docs ===");
for (const d of mateo6) console.log("  ", d.DocumentId, d.Title, "|", d.ContextTitle);

// Check BibleVerse if exists
if (tables.find(t => t.name === "BibleVerse")) {
  console.log("\n=== BibleVerse sample (Mateo range) ===");
  // NWT verse IDs: Mateo starts around 23146 (book 40, ch 1, v 1 = 40*1000000 + 1*1000 + 1 ?)
  const verses = db.prepare("SELECT * FROM BibleVerse LIMIT 5").all();
  for (const v of verses) console.log("  ", JSON.stringify(v));
}

db.close();
