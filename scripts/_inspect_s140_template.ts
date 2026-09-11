import JSZip from "jszip";
import { readFileSync } from "fs";

async function main() {
  const buf = readFileSync("../../templates/S-140.docx");
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  
  // Extract tblGrid
  const grid = xml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);
  if (grid) {
    console.log("=== TABLE GRID (column widths) ===");
    const cols = grid[0].match(/<w:gridCol[^>]*\/>/g) || [];
    cols.forEach((col, i) => {
      const w = col.match(/w:w="(\d+)"/);
      console.log(`  Col ${i}: width=${w ? w[1] : "?"} twips (${w ? Math.round(parseInt(w[1]) / 1440 * 2.54 * 10) / 10 : "?"}cm)`);
    });
  }
  
  // Look at the first content row structure
  const rows = xml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
  console.log(`\n=== TOTAL ROWS: ${rows.length} ===`);
  
  // Find a row with "Conductor/Lector" to inspect
  for (const row of rows) {
    const texts: string[] = [];
    const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = tRegex.exec(row)) !== null) texts.push(m[1]);
    const fullText = texts.join("");
    if (fullText.includes("Conductor") || fullText.includes("conductor")) {
      console.log("\n=== ROW WITH 'Conductor' ===");
      console.log("  Full text:", fullText);
      console.log("  Individual <w:t> nodes:");
      texts.forEach((t, i) => console.log(`    [${i}] "${t}"`));
      
      // Count cells
      const cells = row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
      console.log(`  Cell count: ${cells.length}`);
      cells.forEach((cell, i) => {
        const cellTexts: string[] = [];
        const ct = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let cm;
        while ((cm = ct.exec(cell)) !== null) cellTexts.push(cm[1]);
        console.log(`    Cell[${i}]: "${cellTexts.join("")}" (${cellTexts.length} <w:t> nodes)`);
      });
      break;
    }
  }
  
  // Find a row with "Estudiante" 
  for (const row of rows) {
    const texts: string[] = [];
    const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = tRegex.exec(row)) !== null) texts.push(m[1]);
    const fullText = texts.join("");
    if (fullText.includes("Estudiante")) {
      console.log("\n=== ROW WITH 'Estudiante' ===");
      console.log("  Full text:", fullText);
      const cells = row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
      console.log(`  Cell count: ${cells.length}`);
      cells.forEach((cell, i) => {
        const cellTexts: string[] = [];
        const ct = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let cm;
        while ((cm = ct.exec(cell)) !== null) cellTexts.push(cm[1]);
        console.log(`    Cell[${i}]: "${cellTexts.join("")}" (${cellTexts.length} <w:t> nodes)`);
      });
      break;
    }
  }
}

main();
