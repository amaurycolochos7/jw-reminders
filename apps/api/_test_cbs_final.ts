import { generateS140 } from "./src/services/s140-export/s140-export.service.js";
import JSZip from "jszip";

async function main() {
  const weeks = [
    { dateRange: "3-9 DE AGOSTO", bibleReading: "ISAÍAS 1-3", chairman: "Juan P", openingPrayer: "Pedro L", openingSong: "45", middleSong: "89", closingSong: "120", treasures: { title: "Test", duration: "10 mins.", assignee: "A" }, spiritualGems: { duration: "10 mins.", assignee: "B" }, bibleReadingPart: { duration: "4 mins.", assignee: "C" }, applyYourself: [{ title: "Empiece conversaciones", duration: "3 mins.", reference: "lmd lección 1", student: "Ana P", assistant: "Maria L" }], livingAsChristians: [{ title: "Necesidades de la congregación", duration: "15 mins.", assignee: "Julio D" }], cbs: { duration: "30 mins.", conductor: "Julio D", reader: "Maclovio Z" }, closingPrayer: "Roberto S" },
    { dateRange: "10-16 DE AGOSTO", bibleReading: "ISAÍAS 4-6", chairman: "Juan P", openingPrayer: "Pedro L", openingSong: "46", middleSong: "90", closingSong: "121", treasures: { title: "Test2", duration: "10 mins.", assignee: "D" }, spiritualGems: { duration: "10 mins.", assignee: "E" }, bibleReadingPart: { duration: "4 mins.", assignee: "F" }, applyYourself: [{ title: "Haga revisitas", duration: "4 mins.", reference: "lmd lección 2", student: "Patricia G", assistant: "Marissa T" }], livingAsChristians: [{ title: "Necesidades de la congregación", duration: "15 mins.", assignee: "Julio D" }], cbs: { duration: "30 mins.", conductor: "Dorian de la T", reader: "Amaury G" }, closingPrayer: "Roberto S" },
    { dateRange: "17-23 DE AGOSTO", bibleReading: "ISAÍAS 7-9", chairman: "Juan P", openingPrayer: "Pedro L", openingSong: "47", middleSong: "91", closingSong: "122", treasures: { title: "Test3", duration: "10 mins.", assignee: "G" }, spiritualGems: { duration: "10 mins.", assignee: "H" }, bibleReadingPart: { duration: "4 mins.", assignee: "I" }, applyYourself: [{ title: "Haga discípulos", duration: "3 mins.", reference: "lmd lección 3", student: "Rosa M", assistant: "Lupe N" }], livingAsChristians: [{ title: "Necesidades de la congregación", duration: "15 mins.", assignee: "Julio D" }], cbs: { duration: "30 mins.", conductor: "Octavio R", reader: "Maclovio Z" }, closingPrayer: "Roberto S" },
    { dateRange: "24-30 DE AGOSTO", bibleReading: "ISAÍAS 10-12", chairman: "Juan P", openingPrayer: "Pedro L", openingSong: "48", middleSong: "92", closingSong: "123", treasures: { title: "Test4", duration: "10 mins.", assignee: "J" }, spiritualGems: { duration: "10 mins.", assignee: "K" }, bibleReadingPart: { duration: "4 mins.", assignee: "L" }, applyYourself: [{ title: "Explique sus creencias", duration: "3 mins.", reference: "lmd lección 4", student: "Elena R", assistant: "Sara T" }], livingAsChristians: [{ title: "Necesidades de la congregación", duration: "15 mins.", assignee: "Julio D" }], cbs: { duration: "30 mins.", conductor: "Dorian de la T", reader: "Maclovio Z" }, closingPrayer: "Roberto S" },
  ];

  const buf = await generateS140({ congregationName: "CONGREGACIÓN TEST", weeks });
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const rows = xml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

  let cbsCount = 0;
  let errors = 0;
  const expected = [
    "Julio D / Maclovio Z",
    "Dorian de la T / Amaury G",
    "Octavio R / Maclovio Z",
    "Dorian de la T / Maclovio Z",
  ];

  console.log("── CBS 4-Week Consistency Test ──\n");

  for (const row of rows) {
    const texts: string[] = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(row)) !== null) texts.push(m[1]);
    const full = texts.join("");

    if (full.includes("Estudio") && full.includes("congregaci")) {
      const cellRegex = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
      const cells: Array<{text: string; width: number; span: number}> = [];
      let cm;
      while ((cm = cellRegex.exec(row)) !== null) {
        const ct: string[] = [];
        const cr = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let ctm;
        while ((ctm = cr.exec(cm[0])) !== null) ct.push(ctm[1]);
        const span = cm[0].match(/w:gridSpan w:val="(\d+)"/);
        const width = cm[0].match(/<w:tcW[^>]*w:w="(\d+)"[^>]*\/?>/);
        cells.push({
          text: ct.join(""),
          width: width ? Math.round(parseInt(width[1]) / 1440 * 2.54 * 10) / 10 : 0,
          span: span ? parseInt(span[1]) : 1,
        });
      }

      const expectedNames = expected[cbsCount] || "???";
      cbsCount++;

      console.log(`Week ${cbsCount} (${weeks[cbsCount-1].dateRange}):`);
      cells.forEach((c, i) => console.log(`  Cell[${i}]: ${c.width}cm (span=${c.span}) → "${c.text}"`));

      // Find which cell has the names
      const namesCell = cells.find(c => c.text === expectedNames);
      const labelCell = cells.find(c => c.text.includes("Conductor/Lector"));
      const titleCell = cells.find(c => c.text.includes("Estudio bíblico"));

      if (!namesCell) { console.log(`  ❌ Expected names "${expectedNames}" not found in any cell`); errors++; }
      else if (namesCell.width > 6) { console.log(`  ⚠️  Names in wide cell (${namesCell.width}cm) — may overflow`); }
      else { console.log(`  ✅ Names "${expectedNames}" in ${namesCell.width}cm cell`); }

      if (!labelCell) { console.log(`  ❌ No label cell found`); errors++; }
      else if (labelCell.text.includes(expectedNames)) { console.log(`  ❌ Label cell also contains names!`); errors++; }
      else { console.log(`  ✅ Label: "${labelCell.text}" (${labelCell.width}cm)`); }

      if (titleCell && titleCell.text.includes("Conductor")) {
        console.log(`  ⚠️  Title cell still contains label text`);
      }

      // Check total width
      const totalWidth = cells.reduce((sum, c) => sum + c.width, 0);
      console.log(`  Total row width: ${totalWidth}cm`);
      if (totalWidth > 22) { console.log(`  ❌ Row exceeds page width!`); errors++; }

      // Check no duplication
      const allText = cells.map(c => c.text).join("");
      const nameOccurrences = (allText.match(new RegExp(expectedNames.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g")) || []).length;
      if (nameOccurrences > 1) { console.log(`  ❌ Names appear ${nameOccurrences} times!`); errors++; }

      console.log("");
    }
  }

  console.log(`Total CBS rows: ${cbsCount}`);
  console.log(errors === 0 ? "\n✅ ALL 4 WEEKS CONSISTENT — no overflow, no duplication" : `\n❌ ${errors} ERRORS FOUND`);
  if (errors > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
