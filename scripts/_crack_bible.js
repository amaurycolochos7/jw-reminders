const Database = require("better-sqlite3");
const zlib = require("zlib");
const DB_PATH = "C:/Users/Amaury/AppData/Local/Packages/WatchtowerBibleandTractSo.45909CDBADF3C_5rz59y55nfz3e/LocalState/Publications/nwtsty_S/nwtsty_S.db";
const db = new Database(DB_PATH, { readonly: true });

// Get BibleChapter for Mateo 6
const ch = db.prepare("SELECT * FROM BibleChapter WHERE BibleBookId = 40 AND ChapterNumber = 6").get();
console.log("Mateo 6 chapter:", { id: ch.BibleChapterId, firstVerse: ch.FirstVerseId, lastVerse: ch.LastVerseId });

// Get verse 9 (firstVerse + 8)
const v9id = ch.FirstVerseId + 8;
const v9 = db.prepare("SELECT * FROM BibleVerse WHERE BibleVerseId = ?").get(v9id);
console.log("\nMateo 6:9:");
console.log("  BibleVerseId:", v9.BibleVerseId);
console.log("  Label:", v9.Label);
console.log("  Content length:", v9.Content.length);
console.log("  Content hex:", v9.Content.toString("hex"));

// Known text: "Ustedes deben orar de esta manera:" - about 35 chars
// The content is 96 bytes. If it's the full verse (~107 chars from WOL) that's plausible for compressed.

// Try ALL decompression methods
const buf = v9.Content;
console.log("\n--- Decompression attempts ---");
const methods = [
  { name: "inflateRaw", fn: () => zlib.inflateRawSync(buf) },
  { name: "inflate", fn: () => zlib.inflateSync(buf) },
  { name: "gunzip", fn: () => zlib.gunzipSync(buf) },
  { name: "brotli", fn: () => zlib.brotliDecompressSync(buf) },
];

for (const m of methods) {
  try { const r = m.fn(); console.log(m.name + " SUCCESS:", r.toString("utf8").slice(0, 200)); }
  catch (e) { console.log(m.name + ": failed -", e.message.slice(0, 50)); }
}

// Try with various offsets
for (let skip = 1; skip <= 8; skip++) {
  try { const r = zlib.inflateRawSync(buf.slice(skip)); console.log("inflateRaw skip=" + skip + ":", r.toString("utf8").slice(0, 100)); }
  catch (e) { /* silent */ }
  try { const r = zlib.inflateSync(buf.slice(skip)); console.log("inflate skip=" + skip + ":", r.toString("utf8").slice(0, 100)); }
  catch (e) { /* silent */ }
}

// XOR scan: if first byte XORed with key produces 0x78 (zlib header)
console.log("\n--- XOR scan ---");
for (let key = 0; key < 256; key++) {
  const b0 = buf[0] ^ key;
  const b1 = buf[1] ^ key;
  if (b0 === 0x78 && (b1 === 0x01 || b1 === 0x9C || b1 === 0xDA)) {
    console.log("Key 0x" + key.toString(16) + " produces zlib header " + b0.toString(16) + b1.toString(16));
    const xored = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) xored[i] = buf[i] ^ key;
    try {
      const r = zlib.inflateSync(xored);
      console.log("  INFLATE SUCCESS:", r.toString("utf8").slice(0, 200));
    } catch (e) {
      console.log("  inflate failed:", e.message.slice(0, 50));
    }
  }
}

// Multi-byte XOR: try repeating key patterns
console.log("\n--- Multi-byte XOR with known plaintext ---");
// If plaintext starts with HTML like "<span" (3C 73 70 61 6E)
// buf[0..4] XOR "<span" would give us the key
const knownStarts = [
  { name: "<span", bytes: Buffer.from("<span") },
  { name: "<p ", bytes: Buffer.from("<p ") },
  { name: "<a ", bytes: Buffer.from("<a ") },
  { name: "Uste", bytes: Buffer.from("Uste") },  // "Ustedes deben orar"
  { name: "\u201cUst", bytes: Buffer.from("\u201cUst") },  // "Ustedes with quote
];

for (const known of knownStarts) {
  const keyBytes = [];
  for (let i = 0; i < known.bytes.length; i++) {
    keyBytes.push(buf[i] ^ known.bytes[i]);
  }
  // Try applying this repeating key to the full buffer
  const keyLen = keyBytes.length;
  const xored = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) xored[i] = buf[i] ^ keyBytes[i % keyLen];
  const result = xored.toString("utf8");
  const readable = result.replace(/[^\x20-\x7E\u00C0-\u024F]/g, "").length / result.length;
  if (readable > 0.5) {
    console.log("Known '" + known.name + "' key=[" + keyBytes.map(b => b.toString(16)).join(",") + "]");
    console.log("  Result:", result.slice(0, 150));
  }
}

// Check if the manifest or publication record has a key
const pub = db.prepare("SELECT * FROM Publication LIMIT 1").get();
console.log("\n--- Publication metadata ---");
console.log("Symbol:", pub.Symbol, "MepsBuildNumber:", pub.MepsBuildNumber);

// Check BiblePublication table
const biblePub = db.prepare("PRAGMA table_info(BiblePublication)").all();
console.log("\nBiblePublication cols:", biblePub.map(c => c.name).join(", "));
const bp = db.prepare("SELECT * FROM BiblePublication LIMIT 3").all();
for (const b of bp) {
  const s = {};
  for (const [k,v] of Object.entries(b)) {
    if (Buffer.isBuffer(v)) s[k] = "[BLOB " + v.length + "B]";
    else s[k] = v;
  }
  console.log(JSON.stringify(s));
}

db.close();
