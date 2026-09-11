import { resolveReferences } from "./src/services/research-chat/wol-resolver.service.js";
import { parseAllReferences } from "@jw-reminders/shared";

async function main() {
  console.log("═══ Explicit Reference Resolution Test ═══\n");

  // Test 1: w10 15/7 pág. 24 párr. 15
  console.log("── Test 1: w10 15/7 pág. 24 párr. 15 ──");
  {
    const text = "¿Por qué es importante que los precursores se mantengan al día? (w10 15/7 pág. 24 párr. 15).";
    const { allRefs } = parseAllReferences(text);
    console.log(`  Parsed: ${allRefs.length} ref(s)`);
    allRefs.forEach((r: any) => console.log(`    ${r.type}: ${r.raw || r.book}`));

    const resolved = await resolveReferences(allRefs, text);
    for (const r of resolved) {
      console.log(`  Status: ${r.status}`);
      console.log(`  Origin: ${(r as any).sourceOrigin || "wol"}`);
      console.log(`  Title: ${r.title || "(none)"}`);
      console.log(`  URL: ${r.url || "(none)"}`);
      console.log(`  Blocks: ${r.extractedContent?.length || 0}`);
      if (r.extractedContent?.[0]) {
        console.log(`  Content: "${r.extractedContent[0].text?.substring(0, 100)}..."`);
      }
      console.log(`  Notes: ${r.notes}`);
      
      // Validation
      const isUsable = r.status === "resolved" && r.extractedContent && r.extractedContent.length > 0;
      console.log(`  → ${isUsable ? "✅ USABLE" : "❌ NOT USABLE"}`);
    }
  }

  // Test 2: Mat. 5:14-16 (Bible local)
  console.log("\n── Test 2: Mat. 5:14-16 (Bible local) ──");
  {
    const text = "¿Cómo hacemos brillar nuestra luz? (Mat. 5:14-16).";
    const { allRefs } = parseAllReferences(text);
    console.log(`  Parsed: ${allRefs.length} ref(s)`);

    const resolved = await resolveReferences(allRefs, text);
    for (const r of resolved) {
      console.log(`  Status: ${r.status}`);
      console.log(`  Origin: ${(r as any).sourceOrigin || "?"}`);
      console.log(`  Blocks: ${r.extractedContent?.length || 0}`);
      if (r.extractedContent?.[0]) {
        console.log(`  Content: "${r.extractedContent[0].text?.substring(0, 80)}..."`);
      }
      const isUsable = r.status === "resolved" && r.extractedContent && r.extractedContent.length > 0;
      console.log(`  → ${isUsable ? "✅ USABLE (local_bible)" : "❌ NOT USABLE"}`);
    }
  }

  // Test 3: Multiple refs - Mat. 5:14-16; Mar. 13:10; w12 1/5 pág. 9 párr. 2
  console.log("\n── Test 3: Multiple refs ──");
  {
    const text = "¿Cómo hacemos brillar nuestra luz? (Mat. 5:14-16; Mar. 13:10; w12 1/5 pág. 9 párr. 2).";
    const { allRefs } = parseAllReferences(text);
    console.log(`  Parsed: ${allRefs.length} ref(s)`);
    allRefs.forEach((r: any) => console.log(`    ${r.type}: ${r.raw || r.book + " " + r.chapter + ":" + r.verses}`));

    const resolved = await resolveReferences(allRefs, text);
    let allUsable = true;
    for (const r of resolved) {
      const isUsable = r.status === "resolved" && ((r.extractedContent && r.extractedContent.length > 0) || (r.excerpt && r.excerpt.length > 40));
      console.log(`  ${r.raw}: ${r.status} | origin=${(r as any).sourceOrigin || "?"} | blocks=${r.extractedContent?.length || 0} | ${isUsable ? "✅" : "❌"}`);
      if (!isUsable) allUsable = false;
    }
    console.log(`  → ${allUsable ? "✅ ALL USABLE" : "⚠️  Some not usable (WOL may be needed)"}`);
  }

  // Test 4: Nonexistent reference
  console.log("\n── Test 4: Nonexistent reference ──");
  {
    const text = "¿Qué aprendemos? (xyz99 pág. 99 párr. 1).";
    const { allRefs } = parseAllReferences(text);
    console.log(`  Parsed: ${allRefs.length} ref(s)`);

    if (allRefs.length === 0) {
      console.log("  → Parser did not detect this as a valid reference (correct behavior)");
    } else {
      const resolved = await resolveReferences(allRefs, text);
      for (const r of resolved) {
        const blocked = r.status !== "resolved" || !r.extractedContent || r.extractedContent.length === 0;
        console.log(`  ${r.raw}: ${r.status} | ${blocked ? "✅ BLOCKED (canGenerate=false)" : "❌ Should have been blocked"}`);
      }
    }
  }

  console.log("\n═══ Done ═══");
}

main().catch(e => { console.error(e); process.exit(1); });
