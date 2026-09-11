import { generateS140 } from "./src/services/s140-export/s140-export.service.js";
import JSZip from "jszip";

async function main() {
  const weeks = [
    { dateRange: "3-9 DE AGOSTO", bibleReading: "ISAÍAS 1-3", chairman: "Juan P", openingPrayer: "Pedro L", openingSong: "45", middleSong: "89", closingSong: "120", treasures: { title: "Test", duration: "10 mins.", assignee: "A" }, spiritualGems: { duration: "10 mins.", assignee: "B" }, bibleReadingPart: { duration: "4 mins.", assignee: "C" }, applyYourself: [{ title: "Empiece conversaciones", duration: "3 mins.", reference: "lmd lección 1", student: "Ana P", assistant: "Maria L" }], livingAsChristians: [{ title: "Necesidades de la congregación", duration: "15 mins.", assignee: "Julio D" }], cbs: { duration: "30 mins.", conductor: "Dorian de la T", reader: "Amaury G" }, closingPrayer: "Roberto S" },
    { dateRange: "10-16 DE AGOSTO", bibleReading: "ISAÍAS 4-6", chairman: "Juan P", openingPrayer: "Pedro L", openingSong: "46", middleSong: "90", closingSong: "121", treasures: { title: "Test2", duration: "10 mins.", assignee: "D" }, spiritualGems: { duration: "10 mins.", assignee: "E" }, bibleReadingPart: { duration: "4 mins.", assignee: "F" }, applyYourself: [{ title: "Haga revisitas", duration: "4 mins.", reference: "lmd lección 2", student: "Patricia G", assistant: "Marissa T" }], livingAsChristians: [{ title: "Necesidades de la congregación", duration: "15 mins.", assignee: "Julio D" }], cbs: { duration: "30 mins.", conductor: "Abner T", reader: "Maclovio Z" }, closingPrayer: "Roberto S" },
  ];

  const buf = await generateS140({ congregationName: "CONGREGACIÓN TEST", weeks });
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const rows = xml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

  let cbsCount = 0;
  let errors = 0;

  console.log("── CBS Cell Placement Test ──\n");

  for (const row of rows) {
    const texts: string[] = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(row)) !== null) texts.push(m[1]);
    const full = texts.join("");

    if (full.includes("Estudio") && full.includes("congregaci")) {
      cbsCount++;
      const cells = row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
      const cellTexts = cells.map(cell => {
        const ct: string[] = [];
        const cr = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let cm;
        while ((cm = cr.exec(cell)) !== null) ct.push(cm[1]);
        return ct.join("");
      });

      console.log(`Week ${cbsCount}:`);
      cellTexts.forEach((t, i) => {
        const span = cells[i].match(/w:gridSpan w:val="(\d+)"/);
        const width = cells[i].match(/<w:tcW[^>]*w:w="(\d+)"[^>]*\/?>/);
        const cm = width ? Math.round(parseInt(width[1])/1440*2.54*10)/10 : 0;
        console.log(`  Cell[${i}] (${cm}cm): "${t}"`);
      });

      // Validations
      const titleCell = cellTexts[1] || "";
      const labelCell = cellTexts[2] || "";
      const namesCell = cellTexts[3] || "";

      if (!titleCell.includes("Estudio bíblico")) {
        console.log("  ❌ Cell[1] should have title"); errors++;
      }
      if (titleCell.includes("Conductor/Lector")) {
        console.log("  ❌ Cell[1] should NOT have label mixed in"); errors++;
      }
      if (!labelCell.includes("Conductor/Lector")) {
        console.log("  ❌ Cell[2] should have label 'Conductor/Lector:'"); errors++;
      }
      if (labelCell.includes("/") && !labelCell.includes("Conductor/Lector")) {
        console.log("  ❌ Cell[2] has participant names mixed with label"); errors++;
      }
      if (!namesCell.includes("/")) {
        console.log("  ❌ Cell[3] should have names (conductor / reader)"); errors++;
      }
      if (namesCell.includes("Conductor")) {
        console.log("  ❌ Cell[3] should NOT have label in it"); errors++;
      }

      // Check no other cell has the same names
      const nameInWrongCell = cellTexts.slice(0, 3).find(t => 
        t.includes(namesCell) && namesCell.length > 3 && !t.includes("Estudio")
      );
      if (nameInWrongCell && nameInWrongCell !== labelCell) {
        console.log(`  ❌ Names also found in another cell`); errors++;
      }

      console.log(`  ✅ title="${titleCell.substring(0,50)}..." | label="${labelCell}" | names="${namesCell}"`);
      console.log("");
    }
  }

  console.log(`CBS rows: ${cbsCount}`);
  console.log(errors === 0 ? "✅ ALL VALID — names in correct wide column" : `❌ ${errors} ERRORS`);
  if (errors > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
