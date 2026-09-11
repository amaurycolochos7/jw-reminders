import JSZip from "jszip";
import { readFileSync } from "fs";

async function main() {
  const buf = readFileSync("../../templates/S-140.docx");
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const rows = xml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

  function analyzeRow(label: string, row: string) {
    console.log(`\n--- ${label} ---`);
    const cells = row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
    cells.forEach((cell, i) => {
      const span = cell.match(/w:gridSpan w:val="(\d+)"/);
      const width = cell.match(/<w:tcW[^>]*w:w="(\d+)"[^>]*\/>/);
      const cellTexts: string[] = [];
      const ct = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let cm;
      while ((cm = ct.exec(cell)) !== null) cellTexts.push(cm[1]);
      const spanVal = span ? span[1] : "1";
      const widthVal = width ? `${width[1]}tw (${Math.round(parseInt(width[1])/1440*2.54*10)/10}cm)` : "auto";
      console.log(`  Cell[${i}]: span=${spanVal} width=${widthVal} text="${cellTexts.join("")}"`);
    });
  }

  for (const row of rows) {
    const texts: string[] = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(row)) !== null) texts.push(m[1]);
    const full = texts.join("");
    if (full.includes("Conductor") && full.includes("Estudio")) {
      analyzeRow("CBS ROW (template)", row);
      break;
    }
  }

  for (const row of rows) {
    const texts: string[] = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(row)) !== null) texts.push(m[1]);
    const full = texts.join("");
    if (full.includes("Necesidades") || (full.includes("Vida y Minist") && full.includes("0:00"))) {
      analyzeRow("NVC ROW", row);
      break;
    }
  }

  // Find any NVC content row with a single participant
  for (const row of rows) {
    const texts: string[] = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(row)) !== null) texts.push(m[1]);
    const full = texts.join("");
    // NVC rows have 0:00, section color 7E0024 already passed, and have a participant
    if (full.includes("0:00") && !full.includes("Conductor") && !full.includes("Estudiante") && !full.includes("Canción") && !full.includes("Oración") && !full.includes("Tesoros") && !full.includes("SEAMOS")) {
      const cells = row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
      if (cells.length === 3) {
        analyzeRow("SIMPLE 3-CELL ROW (NVC typical)", row);
        break;
      }
    }
  }

  for (const row of rows) {
    const texts: string[] = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(row)) !== null) texts.push(m[1]);
    const full = texts.join("");
    if (full.includes("Estudiante") && full.includes("0:00")) {
      analyzeRow("SMM ROW (Estudiante)", row);
      break;
    }
  }
}

main();
