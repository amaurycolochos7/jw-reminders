/**
 * Auditoría profunda de pt14_S.db (Libro de los precursores).
 * Reporta: tablas, columnas, conteos, muestras, estructura de contenido.
 * 
 * Run: npx tsx scripts/inspect-precursor-jwpub.ts
 */

import Database from "better-sqlite3";
import { resolve } from "path";
import { existsSync } from "fs";

const DB_PATH = resolve(__dirname, "../pt14_S_extracted/contents_db/pt14_S.db");

if (!existsSync(DB_PATH)) {
  console.error(`❌ No se encontró: ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

// ─── 1. Tablas ───────────────────────────────────────────
console.log("═══════════════════════════════════════");
console.log("1. TABLAS ENCONTRADAS");
console.log("═══════════════════════════════════════");

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
console.log(tables.map(t => t.name).join(", "));
console.log(`\nTotal: ${tables.length} tablas\n`);

// ─── 2. Columnas y conteos ───────────────────────────────
console.log("═══════════════════════════════════════");
console.log("2. COLUMNAS Y CONTEOS POR TABLA");
console.log("═══════════════════════════════════════\n");

for (const table of tables) {
  const cols = db.prepare(`PRAGMA table_info('${table.name}')`).all() as { name: string; type: string }[];
  const count = db.prepare(`SELECT COUNT(*) as c FROM '${table.name}'`).get() as { c: number };
  console.log(`📋 ${table.name} (${count.c} registros)`);
  console.log(`   Columnas: ${cols.map(c => `${c.name}[${c.type}]`).join(", ")}`);
  console.log();
}

// ─── 3. Muestras de tablas importantes ───────────────────
console.log("═══════════════════════════════════════");
console.log("3. MUESTRAS (5 registros por tabla importante)");
console.log("═══════════════════════════════════════\n");

const importantTables = ["Document", "DocumentExtract", "Extract", "Question", 
  "InternalLink", "Footnote", "Bible", "BibleCitation", "Bookmark",
  "SearchIndexDocument", "Paragraph", "TextUnit", "PublicationView"];

for (const tableName of tables.map(t => t.name)) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM '${tableName}'`).get() as { c: number };
  if (count.c === 0) continue;
  
  console.log(`─── ${tableName} (${count.c} registros) ───`);
  const rows = db.prepare(`SELECT * FROM '${tableName}' LIMIT 5`).all();
  for (const row of rows) {
    const summary: Record<string, any> = {};
    for (const [key, value] of Object.entries(row as Record<string, any>)) {
      if (value === null) continue;
      if (Buffer.isBuffer(value)) {
        // Check if it's text/HTML/compressed
        const preview = value.slice(0, 100).toString("utf8");
        const isText = /^[\x20-\x7E\xC0-\xFF\n\r\t<]/.test(preview);
        summary[key] = isText 
          ? `[BLOB ${value.length}B text] ${preview.slice(0, 80)}...`
          : `[BLOB ${value.length}B binary] magic: ${value.slice(0, 4).toString("hex")}`;
      } else if (typeof value === "string" && value.length > 120) {
        summary[key] = value.slice(0, 120) + "...";
      } else {
        summary[key] = value;
      }
    }
    console.log(`  ${JSON.stringify(summary)}`);
  }
  console.log();
}

// ─── 4. Buscar contenido HTML/texto ──────────────────────
console.log("═══════════════════════════════════════");
console.log("4. DETECCIÓN DE CONTENIDO (HTML/TEXTO/BLOBS)");
console.log("═══════════════════════════════════════\n");

// Check Document table for content
const docSample = db.prepare("SELECT * FROM Document LIMIT 3").all() as any[];
if (docSample.length > 0) {
  console.log("Document table columns:", Object.keys(docSample[0]).join(", "));
  for (const doc of docSample) {
    console.log(`\n  DocId: ${doc.DocumentId || doc.Id || "?"}`);
    for (const [key, val] of Object.entries(doc)) {
      if (Buffer.isBuffer(val)) {
        const buf = val as Buffer;
        const preview = buf.slice(0, 200).toString("utf8");
        const isHtml = preview.includes("<") && preview.includes(">");
        const isCompressed = buf[0] === 0x1f && buf[1] === 0x8b; // gzip
        console.log(`  ${key}: [${buf.length}B] ${isCompressed ? "GZIP" : isHtml ? "HTML" : "TEXT"}`);
        if (!isCompressed) console.log(`    Preview: ${preview.slice(0, 150)}`);
      }
    }
  }
}

// ─── 5. Tablas con 'Extract' (referencias) ──────────────
console.log("\n═══════════════════════════════════════");
console.log("5. EXTRACTOS Y REFERENCIAS");
console.log("═══════════════════════════════════════\n");

for (const tbl of ["Extract", "DocumentExtract"]) {
  const exists = tables.find(t => t.name === tbl);
  if (!exists) { console.log(`  ${tbl}: NO EXISTE`); continue; }
  const count = db.prepare(`SELECT COUNT(*) as c FROM '${tbl}'`).get() as { c: number };
  console.log(`  ${tbl}: ${count.c} registros`);
  const rows = db.prepare(`SELECT * FROM '${tbl}' LIMIT 5`).all();
  for (const row of rows) {
    const summary: Record<string, any> = {};
    for (const [key, value] of Object.entries(row as Record<string, any>)) {
      if (value === null) continue;
      if (Buffer.isBuffer(value)) {
        summary[key] = `[BLOB ${value.length}B]`;
      } else if (typeof value === "string" && value.length > 150) {
        summary[key] = value.slice(0, 150) + "...";
      } else {
        summary[key] = value;
      }
    }
    console.log(`    ${JSON.stringify(summary)}`);
  }
  console.log();
}

// ─── 6. Buscar tabla de preguntas (Question) ─────────────
console.log("═══════════════════════════════════════");
console.log("6. BÚSQUEDA DE PREGUNTAS");
console.log("═══════════════════════════════════════\n");

const questionTable = tables.find(t => t.name.toLowerCase().includes("question"));
if (questionTable) {
  console.log(`  Tabla encontrada: ${questionTable.name}`);
  const rows = db.prepare(`SELECT * FROM '${questionTable.name}' LIMIT 10`).all();
  for (const row of rows) console.log(`    ${JSON.stringify(row)}`);
} else {
  console.log("  ⚠️ No hay tabla 'Question'. Buscar preguntas en contenido HTML/texto.");
  // Search in Document content for question marks
  const docsWithQuestions = db.prepare(`
    SELECT DocumentId, Title FROM Document 
    WHERE Title IS NOT NULL 
    LIMIT 20
  `).all() as any[];
  console.log("  Documentos con título:");
  for (const d of docsWithQuestions) {
    console.log(`    ${d.DocumentId}: ${d.Title}`);
  }
}

// ─── 7. Buscar referencias bíblicas ─────────────────────
console.log("\n═══════════════════════════════════════");
console.log("7. REFERENCIAS BÍBLICAS");
console.log("═══════════════════════════════════════\n");

for (const tbl of ["Bible", "BibleCitation", "BibleVerse", "ScriptureReference", "BibleBook"]) {
  const exists = tables.find(t => t.name === tbl);
  if (!exists) continue;
  const count = db.prepare(`SELECT COUNT(*) as c FROM '${tbl}'`).get() as { c: number };
  console.log(`  ${tbl}: ${count.c} registros`);
  const rows = db.prepare(`SELECT * FROM '${tbl}' LIMIT 3`).all();
  for (const row of rows) console.log(`    ${JSON.stringify(row)}`);
  console.log();
}

// ─── 8. Índices y relaciones ─────────────────────────────
console.log("═══════════════════════════════════════");
console.log("8. ÍNDICES");
console.log("═══════════════════════════════════════\n");

const indexes = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all() as any[];
for (const idx of indexes) {
  console.log(`  ${idx.name} → ${idx.tbl_name}`);
}

db.close();
console.log("\n✅ Auditoría completada.");
