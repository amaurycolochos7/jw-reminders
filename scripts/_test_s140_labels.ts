/**
 * Validation test for S-140 DOCX generation.
 * Checks: no label duplication, correct cell placement.
 *
 * Run: pnpm --filter @jw-reminders/api exec tsx ../../scripts/_test_s140_labels.ts
 */
import { generateS140 } from "../apps/api/src/services/s140-export/s140-export.service.js";
import JSZip from "jszip";

async function main() {
  console.log("── S-140 Label Duplication Test ──\n");

  const buf = await generateS140({
    congregationName: "CONGREGACIÓN TEST",
    weeks: [{
      dateRange: "7-13 DE JULIO",
      bibleReading: "ISAÍAS 1-3",
      chairman: "Juan P",
      openingPrayer: "Pedro L",
      openingSong: "45",
      middleSong: "89",
      closingSong: "120",
      treasures: { title: "Un Dios que habla", duration: "10 mins.", assignee: "Mario G" },
      spiritualGems: { duration: "10 mins.", assignee: "Luis R" },
      bibleReadingPart: { duration: "4 mins.", assignee: "Carlos M" },
      applyYourself: [
        { title: "Empiece conversaciones", duration: "3 mins.", reference: "lmd lección 1 punto 5", student: "Ana P", assistant: "María L" },
        { title: "Haga revisitas", duration: "4 mins.", reference: "lmd lección 2", student: "Patricia G", assistant: "Marissa De La T" },
      ],
      livingAsChristians: [
        { title: "Necesidades de la congregación", duration: "15 mins.", assignee: "Julio D" },
      ],
      cbs: { duration: "30 mins.", conductor: "Abner T", reader: "Maclovio Z" },
      closingPrayer: "Roberto S",
    }],
  });

  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");

  // Extract all text nodes
  const texts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) texts.push(m[1]);
  const full = texts.join("");

  let ok = true;

  // Check 1: No label duplication
  if (full.includes("Conductor/Lector:Conductor/Lector") || full.includes("Conductor/LectorConductor")) {
    console.log("  ❌ FAIL: 'Conductor/Lector' duplicated");
    ok = false;
  } else {
    console.log("  ✅ No 'Conductor/Lector' duplication");
  }

  if (full.includes("Estudiante/Ayudante:Estudiante/Ayudante") || full.includes("Estudiante/AyudanteEstudiante")) {
    console.log("  ❌ FAIL: 'Estudiante/Ayudante' duplicated");
    ok = false;
  } else {
    console.log("  ✅ No 'Estudiante/Ayudante' duplication");
  }

  // Check 2: CBS label appears exactly once per week
  const cbsMatches = full.match(/Conductor\/Lector/g) || [];
  if (cbsMatches.length === 1) {
    console.log(`  ✅ 'Conductor/Lector' appears exactly 1 time`);
  } else {
    console.log(`  ⚠️  'Conductor/Lector' appears ${cbsMatches.length} times (expected 1 per week)`);
  }

  // Check 3: Names are in expected position
  if (full.includes("Abner T / Maclovio Z")) {
    console.log("  ✅ CBS names 'Abner T / Maclovio Z' present");
  } else {
    console.log("  ❌ FAIL: CBS names not found");
    ok = false;
  }

  if (full.includes("Ana P / María L")) {
    console.log("  ✅ SMM names 'Ana P / María L' present");
  } else {
    console.log("  ❌ FAIL: SMM names not found");
    ok = false;
  }

  if (full.includes("Patricia G / Marissa De La T")) {
    console.log("  ✅ SMM names 'Patricia G / Marissa De La T' present");
  } else {
    console.log("  ❌ FAIL: SMM names (second part) not found");
    ok = false;
  }

  // Check 4: CBS text structure
  const cbsStart = full.indexOf("Estudio bíblico de la congregación");
  const cbsEnd = cbsStart + 100;
  const cbsSection = full.substring(cbsStart, cbsEnd);
  console.log(`\n  CBS section text: "${cbsSection}"`);

  // Check 5: SMM Estudiante label count
  const smmMatches = full.match(/Estudiante\/Ayudante/g) || [];
  console.log(`  'Estudiante/Ayudante' appears ${smmMatches.length} times (expected 2 for 2 SMM parts)`);

  console.log(`\n${ok ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
