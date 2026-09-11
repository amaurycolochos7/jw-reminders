import JSZip from "jszip";
import { readFileSync } from "fs";

async function main() {
  const buf = readFileSync("../../templates/S-140.docx");
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const rows = xml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

  let cbsIdx = 0;
  for (const row of rows) {
    const texts: string[] = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(row)) !== null) texts.push(m[1]);
    const full = texts.join("");
    if (full.includes("Estudio") && full.includes("congregaci")) {
      cbsIdx++;
      console.log(`\n=== CBS BLOCK ${cbsIdx} ===`);
      const cells = row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
      cells.forEach((cell, i) => {
        const span = cell.match(/w:gridSpan w:val="(\d+)"/);
        const width = cell.match(/<w:tcW[^>]*w:w="(\d+)"[^>]*\/?>/);
        const ct: string[] = [];
        const cr = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let cm;
        while ((cm = cr.exec(cell)) !== null) ct.push(cm[1]);
        const spanVal = span ? span[1] : "1";
        const widthCm = width ? Math.round(parseInt(width[1]) / 1440 * 2.54 * 10) / 10 : 0;
        console.log(`  Cell[${i}]: span=${spanVal} width=${widthCm}cm text="${ct.join("")}"`);
      });
    }
  }
}

main();
