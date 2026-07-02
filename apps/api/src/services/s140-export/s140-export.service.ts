/**
 * S-140 Export Service
 *
 * Genera un documento DOCX oficial del programa de la reunión de entre semana
 * usando S-140.docx como plantilla viva. Estrategia: Row Cloning + Positional
 * Text Replacement sobre el XML del document.xml interno.
 */
import JSZip from "jszip";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Types ───────────────────────────────────────────────

export interface S140WeekData {
  /** Rango de fechas, ej: "16-22 DE MARZO" */
  dateRange: string;
  /** Lectura bíblica semanal, ej: "ISAÍAS 45-47" */
  bibleReading: string;
  /** Nombre del presidente */
  chairman: string;
  /** Nombre de la oración inicial */
  openingPrayer: string;
  /** Número de canción inicial */
  openingSong: string;
  /** Número de canción intermedia */
  middleSong: string;
  /** Número de canción final */
  closingSong: string;

  // TESOROS DE LA BIBLIA
  treasures: {
    title: string;
    duration: string;
    assignee: string;
  };
  spiritualGems: {
    duration: string;
    assignee: string;
  };
  bibleReadingPart: {
    duration: string;
    assignee: string;
  };

  // SEAMOS MEJORES MAESTROS (variable: 2-4 partes)
  applyYourself: Array<{
    title: string;
    duration: string;
    reference: string;
    student: string;
    assistant: string;
  }>;

  // NUESTRA VIDA CRISTIANA (variable: 1-3 partes)
  livingAsChristians: Array<{
    title: string;
    duration: string;
    assignee: string;
  }>;

  // ESTUDIO BÍBLICO DE LA CONGREGACIÓN
  cbs: {
    duration: string;
    conductor: string;
    reader: string;
  };

  /** Nombre de oración final */
  closingPrayer: string;
}

export interface S140ExportInput {
  congregationName: string;
  weeks: S140WeekData[];
}

// ─── Template path ───────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getTemplatePath(): string {
  // Try multiple resolution strategies for monorepo compatibility
  const candidates = [
    resolve(__dirname, "../../../../../templates/S-140.docx"),  // from src/ or dist/
    resolve(process.cwd(), "templates/S-140.docx"),            // from apps/api/ CWD
    resolve(process.cwd(), "../../templates/S-140.docx"),      // from apps/api/ to root
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Template S-140.docx not found. Searched: ${candidates.join(", ")}`);
}

// ─── XML Helpers ─────────────────────────────────────────

/** Escape XML special characters */
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Generate a random 8-char hex paraId for cloned rows */
function randomParaId(): string {
  return Math.random().toString(16).slice(2, 10).toUpperCase().padStart(8, "0");
}

/** Replace all paraId/textId attributes in a string with random ones */
function regenerateIds(xml: string): string {
  return xml
    .replace(/w14:paraId="[A-F0-9]{8}"/g, () => `w14:paraId="${randomParaId()}"`)
    .replace(/w14:textId="[A-F0-9]{8}"/g, () => `w14:textId="${randomParaId()}"`);
}

// ─── Row Extraction ──────────────────────────────────────

/** Split the table body into individual <w:tr>...</w:tr> rows */
function extractRows(tableXml: string): string[] {
  const rows: string[] = [];
  const regex = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(tableXml)) !== null) {
    rows.push(match[0]);
  }
  return rows;
}

/** Get all text content from a row (concatenated <w:t> values) */
function getRowText(row: string): string {
  const texts: string[] = [];
  const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(row)) !== null) {
    texts.push(m[1]);
  }
  return texts.join("");
}

/** Check if a row contains a specific section header color (shading) */
function hasSectionShading(row: string, color: string): boolean {
  return row.includes(`w:fill="${color}"`);
}

// ─── Week Block Identification ───────────────────────────

interface WeekBlock {
  startIndex: number;  // Index of the date/chairman row
  endIndex: number;    // Index of the last row (closing prayer/song)
}

/**
 * Identifies week blocks within the table rows.
 * A week block starts with a row containing a date range (bold text with "|")
 * and ends just before the next date row or at the end of the table.
 */
function identifyWeekBlocks(rows: string[]): WeekBlock[] {
  const blocks: WeekBlock[] = [];
  const dateRowIndices: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const text = getRowText(rows[i]);
    // Date rows contain "| " separator between date range and bible reading
    // AND contain "Presidente" label in Spanish
    if ((text.includes("|") || text.includes("| ")) && text.includes("Presidente")) {
      dateRowIndices.push(i);
    }
  }

  for (let i = 0; i < dateRowIndices.length; i++) {
    const start = dateRowIndices[i];
    const end = i < dateRowIndices.length - 1
      ? dateRowIndices[i + 1] - 1
      : rows.length - 1;
    blocks.push({ startIndex: start, endIndex: end });
  }

  return blocks;
}

// ─── Text Replacement Within Rows ────────────────────────

/**
 * Replace text in a specific cell of a row by cell index (0-based).
 * Cells are identified by <w:tc> elements. Inside each cell, we replace
 * ALL <w:t> content with the new value, preserving formatting.
 */
function replaceCellText(row: string, cellIndex: number, newText: string): string {
  // Split row into cells
  const cellRegex = /<w:tc>[\s\S]*?<\/w:tc>|<w:tc\s[^>]*>[\s\S]*?<\/w:tc>/g;
  const cells: { start: number; end: number; content: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(row)) !== null) {
    cells.push({ start: m.index, end: m.index + m[0].length, content: m[0] });
  }

  if (cellIndex >= cells.length || cellIndex < 0) return row;

  const cell = cells[cellIndex];
  // Replace all <w:t> content within this cell
  const escapedText = xmlEscape(newText);
  const newCell = replaceAllTextInElement(cell.content, escapedText);

  return row.slice(0, cell.start) + newCell + row.slice(cell.end);
}

/**
 * Replace all <w:t> nodes in an element with a single text value.
 * Keeps the FIRST <w:r> with its formatting and removes extra runs.
 */
function replaceAllTextInElement(xml: string, newText: string): string {
  // Find all <w:r> elements (runs)
  const runRegex = /<w:r[\s>][\s\S]*?<\/w:r>/g;
  const runs: { start: number; end: number; content: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = runRegex.exec(xml)) !== null) {
    // Skip proofErr elements that look like runs
    if (m[0].includes("<w:proofErr")) continue;
    runs.push({ start: m.index, end: m.index + m[0].length, content: m[0] });
  }

  if (runs.length === 0) return xml;

  // Use the first run, replace its <w:t> content, remove all other runs
  const firstRun = runs[0];
  const updatedRun = firstRun.content.replace(
    /<w:t[^>]*>[^<]*<\/w:t>/,
    `<w:t>${newText}</w:t>`
  );

  // Build result: everything before first run + updated first run + everything after last run
  const lastRun = runs[runs.length - 1];
  // Remove proofErr elements between/around runs
  const afterLastRun = xml.slice(lastRun.end).replace(/<w:proofErr[^/]*\/>/g, "");
  const betweenProof = xml.slice(0, firstRun.start).replace(/<w:proofErr[^/]*\/>/g, "");

  return betweenProof + updatedRun + afterLastRun;
}

/**
 * Replace text in the "last cell" of a row (typically the name column).
 */
function replaceLastCellText(row: string, newText: string): string {
  const cellRegex = /<w:tc>[\s\S]*?<\/w:tc>|<w:tc\s[^>]*>[\s\S]*?<\/w:tc>/g;
  const cells: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(row)) !== null) {
    cells.push(cells.length);
  }
  if (cells.length === 0) return row;
  return replaceCellText(row, cells.length - 1, newText);
}

/**
 * Replace the main content text of a row (middle cells, typically the title/part).
 * This targets the cell after the time column and before the name column.
 */
function replaceContentText(row: string, newText: string): string {
  const cellRegex = /<w:tc>[\s\S]*?<\/w:tc>|<w:tc\s[^>]*>[\s\S]*?<\/w:tc>/g;
  const cells: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(row)) !== null) {
    cells.push(cells.length);
  }
  // For a standard content row: cell[0]=time, cell[1]=content, cell[2]=name
  // Content is typically in cell index 1
  if (cells.length >= 2) {
    return replaceCellText(row, 1, newText);
  }
  return row;
}

// ─── Week Block Builder ──────────────────────────────────

/**
 * Given an existing week block (array of row strings), fill in data from S140WeekData.
 * Returns a new array of rows with the data replaced.
 */
function fillWeekBlock(blockRows: string[], data: S140WeekData): string[] {
  const result = [...blockRows];
  
  // We navigate the block by semantic role detection:
  // - Date row: has "|" and "Presidente"
  // - Prayer row: has "Oración"
  // - Song row: has "Canción"
  // - Section header: has colored shading (575A5D, BE8900, 7E0024)
  // - Content rows: have "0:00" time marker
  
  let dateRowIdx = -1;
  let prayerRowIdx = -1;
  const songRows: number[] = [];
  let tesorosHeaderIdx = -1;
  let smmHeaderIdx = -1;
  let nvcHeaderIdx = -1;
  const contentRows: number[] = [];
  
  for (let i = 0; i < result.length; i++) {
    const text = getRowText(result[i]);
    const row = result[i];
    
    if (text.includes("Presidente") && (text.includes("|") || text.includes("| "))) {
      dateRowIdx = i;
    } else if (text.includes("Oración") && text.includes(":")) {
      if (prayerRowIdx === -1) prayerRowIdx = i;
    } else if (text.includes("Canción")) {
      songRows.push(i);
    } else if (hasSectionShading(row, "575A5D") && text.includes("TESOROS")) {
      tesorosHeaderIdx = i;
    } else if (hasSectionShading(row, "BE8900") && text.includes("SEAMOS")) {
      smmHeaderIdx = i;
    } else if (hasSectionShading(row, "7E0024") && text.includes("NUESTRA")) {
      nvcHeaderIdx = i;
    }
  }

  // 1. Date row: replace date range + bible reading in the first content cell,
  //    and president name in the last cell
  if (dateRowIdx >= 0) {
    const dateText = `${data.dateRange} | ${data.bibleReading}`;
    result[dateRowIdx] = replaceCellText(result[dateRowIdx], 0, dateText);
    result[dateRowIdx] = replaceLastCellText(result[dateRowIdx], data.chairman);
  }

  // 2. Opening prayer row
  if (prayerRowIdx >= 0) {
    result[prayerRowIdx] = replaceLastCellText(result[prayerRowIdx], data.openingPrayer);
  }

  // 3. Songs (opening, middle, closing)
  if (songRows.length >= 1) {
    result[songRows[0]] = replaceContentText(result[songRows[0]], `Canción ${data.openingSong}`);
  }
  if (songRows.length >= 2) {
    result[songRows[1]] = replaceContentText(result[songRows[1]], `Canción ${data.middleSong}`);
  }
  if (songRows.length >= 3) {
    // The closing song often has "Oración:" in same or adjacent row
    const lastSongText = getRowText(result[songRows[2]]);
    if (lastSongText.includes("Oración")) {
      // Song + prayer in one section - replace song text and prayer name
      result[songRows[2]] = replaceContentText(result[songRows[2]], `Canción ${data.closingSong}`);
      result[songRows[2]] = replaceLastCellText(result[songRows[2]], data.closingPrayer);
    } else {
      result[songRows[2]] = replaceContentText(result[songRows[2]], `Canción ${data.closingSong}`);
    }
  }

  // 4. TESOROS section parts (between tesoros header and SMM header)
  if (tesorosHeaderIdx >= 0 && smmHeaderIdx >= 0) {
    const tesorosContentRows: number[] = [];
    for (let i = tesorosHeaderIdx + 1; i < smmHeaderIdx; i++) {
      const text = getRowText(result[i]);
      if (text.includes("0:00") || text.match(/^\d\./)) {
        tesorosContentRows.push(i);
      }
    }
    // Part 1: Treasures talk
    if (tesorosContentRows.length >= 1) {
      const idx = tesorosContentRows[0];
      const partText = `1. ${data.treasures.title} (${data.treasures.duration})`;
      result[idx] = replaceContentText(result[idx], partText);
      result[idx] = replaceLastCellText(result[idx], data.treasures.assignee);
    }
    // Part 2: Spiritual Gems
    if (tesorosContentRows.length >= 2) {
      const idx = tesorosContentRows[1];
      const partText = `2. Busquemos perlas escondidas (${data.spiritualGems.duration})`;
      result[idx] = replaceContentText(result[idx], partText);
      result[idx] = replaceLastCellText(result[idx], data.spiritualGems.assignee);
    }
    // Part 3: Bible Reading
    if (tesorosContentRows.length >= 3) {
      const idx = tesorosContentRows[2];
      const partText = `3. Lectura de la Biblia (${data.bibleReadingPart.duration})`;
      result[idx] = replaceContentText(result[idx], partText);
      result[idx] = replaceLastCellText(result[idx], data.bibleReadingPart.assignee);
    }
  }

  // 5. SMM section parts (between SMM header and NVC header)
  if (smmHeaderIdx >= 0 && nvcHeaderIdx >= 0) {
    const smmContentRows: number[] = [];
    for (let i = smmHeaderIdx + 1; i < nvcHeaderIdx; i++) {
      const text = getRowText(result[i]);
      if (text.includes("0:00")) {
        smmContentRows.push(i);
      }
    }
    
    // We need to handle variable number of SMM parts
    const smmParts = data.applyYourself;
    for (let p = 0; p < Math.min(smmParts.length, smmContentRows.length); p++) {
      const idx = smmContentRows[p];
      const part = smmParts[p];
      const num = p + 4; // Parts start at 4
      const refText = part.reference ? ` (${part.reference}).` : "";
      const partText = `${num}. ${part.title} (${part.duration})${refText}`;
      result[idx] = replaceContentText(result[idx], partText);
      const nameText = part.assistant
        ? `${part.student} / ${part.assistant}`
        : part.student;
      result[idx] = replaceLastCellText(result[idx], nameText);
    }
    
    // If we have MORE parts than template rows, clone and insert
    if (smmParts.length > smmContentRows.length && smmContentRows.length > 0) {
      const templateRow = result[smmContentRows[smmContentRows.length - 1]];
      const insertAt = smmContentRows[smmContentRows.length - 1] + 1;
      const extra: string[] = [];
      for (let p = smmContentRows.length; p < smmParts.length; p++) {
        const part = smmParts[p];
        const num = p + 4;
        const refText = part.reference ? ` (${part.reference}).` : "";
        const partText = `${num}. ${part.title} (${part.duration})${refText}`;
        let newRow = regenerateIds(templateRow);
        newRow = replaceContentText(newRow, partText);
        const nameText = part.assistant
          ? `${part.student} / ${part.assistant}`
          : part.student;
        newRow = replaceLastCellText(newRow, nameText);
        extra.push(newRow);
      }
      result.splice(insertAt, 0, ...extra);
      // Adjust indices after insertion
      nvcHeaderIdx += extra.length;
    }
    
    // If we have FEWER parts, remove extra rows
    if (smmParts.length < smmContentRows.length) {
      const toRemove = smmContentRows.slice(smmParts.length);
      for (let r = toRemove.length - 1; r >= 0; r--) {
        result.splice(toRemove[r], 1);
        nvcHeaderIdx -= 1;
      }
    }
  }

  // Re-scan for NVC section after possible SMM modifications
  let nvcActualIdx = -1;
  for (let i = 0; i < result.length; i++) {
    if (hasSectionShading(result[i], "7E0024") && getRowText(result[i]).includes("NUESTRA")) {
      nvcActualIdx = i;
      break;
    }
  }

  // 6. NVC section parts + EBC + conclusion
  if (nvcActualIdx >= 0) {
    // Find all content rows after NVC header
    const nvcContentRows: number[] = [];
    const nvcSongRows: number[] = [];
    let conclusionRow = -1;
    let cbsRow = -1;
    let closingSongRow = -1;
    
    for (let i = nvcActualIdx + 1; i < result.length; i++) {
      const text = getRowText(result[i]);
      if (text.includes("Canción") && !text.includes("Oración")) {
        nvcSongRows.push(i);
      } else if (text.includes("Canción") && text.includes("Oración")) {
        closingSongRow = i;
      } else if (text.toLowerCase().includes("estudio") && text.toLowerCase().includes("bíblico") ||
                 text.toLowerCase().includes("estudio") && text.toLowerCase().includes("biblico") ||
                 text.includes("Estudio") && text.includes("congregaci")) {
        cbsRow = i;
      } else if (text.toLowerCase().includes("conclusi") || text.includes("conclusión")) {
        conclusionRow = i;
      } else if (text.includes("0:00") && cbsRow === -1 && conclusionRow === -1) {
        nvcContentRows.push(i);
      }
    }

    // NVC song (middle song - first song after NVC header)
    // Already handled above in songRows

    // NVC parts
    const nvcParts = data.livingAsChristians;
    for (let p = 0; p < Math.min(nvcParts.length, nvcContentRows.length); p++) {
      const idx = nvcContentRows[p];
      const part = nvcParts[p];
      const num = data.applyYourself.length + 4 + p;
      const partText = `${num}. ${part.title} (${part.duration})`;
      result[idx] = replaceContentText(result[idx], partText);
      result[idx] = replaceLastCellText(result[idx], part.assignee);
    }

    // CBS
    if (cbsRow >= 0) {
      const cbsText = `Estudio bíblico de la congregación (${data.cbs.duration})`;
      result[cbsRow] = replaceContentText(result[cbsRow], cbsText);
      const cbsNames = `${data.cbs.conductor} / ${data.cbs.reader}`;
      result[cbsRow] = replaceLastCellText(result[cbsRow], cbsNames);
    }

    // Conclusion row
    if (conclusionRow >= 0) {
      result[conclusionRow] = replaceContentText(result[conclusionRow], "Palabras de conclusión (3 mins.)");
    }

    // Closing song + prayer (usually last row)
    if (closingSongRow >= 0) {
      result[closingSongRow] = replaceContentText(result[closingSongRow], `Canción ${data.closingSong}`);
      result[closingSongRow] = replaceLastCellText(result[closingSongRow], data.closingPrayer);
    }
  }

  return result;
}

// ─── Main Export Function ────────────────────────────────

/**
 * Generate an S-140 DOCX file from the given data.
 * Returns a Buffer containing the complete .docx file.
 */
export async function generateS140(input: S140ExportInput): Promise<Buffer> {
  // 1. Read template
  const templatePath = getTemplatePath();
  const templateBuffer = readFileSync(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);

  // 2. Get document.xml
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) throw new Error("Template corrupted: missing word/document.xml");
  let docXml = await docXmlFile.async("string");

  // 3. Extract the table (the whole document IS one table)
  const tableStart = docXml.indexOf("<w:tbl>");
  const tableEnd = docXml.lastIndexOf("</w:tbl>") + "</w:tbl>".length;
  if (tableStart === -1 || tableEnd === -1) throw new Error("Template corrupted: no table found");

  const beforeTable = docXml.slice(0, tableStart);
  const tableXml = docXml.slice(tableStart, tableEnd);
  const afterTable = docXml.slice(tableEnd);

  // 4. Extract table properties (tblPr + tblGrid) and rows
  const tblPrMatch = tableXml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/);
  const tblGridMatch = tableXml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);
  const tblPr = tblPrMatch ? tblPrMatch[0] : "";
  const tblGrid = tblGridMatch ? tblGridMatch[0] : "";

  const rows = extractRows(tableXml);

  // 5. Identify week blocks in the template
  const blocks = identifyWeekBlocks(rows);
  if (blocks.length === 0) throw new Error("Template corrupted: no week blocks identified");

  // 6. Identify the header rows (before first week block)
  const headerRows = rows.slice(0, blocks[0].startIndex);

  // 7. Replace congregation name in header
  const congregationName = input.congregationName;
  if (headerRows.length > 0) {
    headerRows[0] = replaceCellText(headerRows[0], 0, congregationName);
  }

  // 8. Build output rows: header + filled week blocks
  const outputRows: string[] = [...headerRows];

  for (let w = 0; w < input.weeks.length; w++) {
    const weekData = input.weeks[w];
    // Use the appropriate template block (first or second)
    const templateBlockIdx = Math.min(w, blocks.length - 1);
    const block = blocks[templateBlockIdx];
    const blockRows = rows.slice(block.startIndex, block.endIndex + 1);

    // Clone and fill
    let filledRows = blockRows.map((r) => regenerateIds(r));
    filledRows = fillWeekBlock(filledRows, weekData);
    outputRows.push(...filledRows);
  }

  // 9. Reassemble table
  const newTable = `<w:tbl>${tblPr}${tblGrid}${outputRows.join("")}</w:tbl>`;

  // 10. Reassemble document.xml
  docXml = beforeTable + newTable + afterTable;

  // 11. Write back to zip
  zip.file("word/document.xml", docXml);

  // 12. Generate output buffer
  const outputBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return outputBuffer;
}
