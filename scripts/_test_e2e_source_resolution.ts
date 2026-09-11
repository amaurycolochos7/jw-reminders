/**
 * E2E Test: Full research-chat flow without calling OpenAI.
 * Tests reference parsing → resolution → source-gating.
 * 
 * Run: npx tsx scripts/_test_e2e_source_resolution.ts
 */

import { resolveReferences } from "../apps/api/src/services/research-chat/wol-resolver.service.js";
import { parseAllReferences } from "../packages/shared/src/research-references/index.js";

async function main() {
  // Disable WOL for predictable results (Bible from local, WOL from cache/fallback)
  process.env.RESEARCH_CHAT_WOL_ENABLED = "false";

  console.log("═══════════════════════════════════════════════════════════");
  console.log("E2E TEST: Source resolution + source-gating (NO OpenAI)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ─── Test 1: Juan 17:3 from local Bible ───

  console.log("── Test 1: Juan 17:3 (Biblia local) ──");
  {
    const { allRefs } = parseAllReferences("Juan 17:3");
    const results = await resolveReferences(allRefs);
    const r = results[0];
    console.log(JSON.stringify({
      reference: r?.raw,
      type: r?.type,
      sourceOrigin: (r as any)?.sourceOrigin,
      status: r?.status,
      textLength: r?.extractedContent?.[0]?.text?.length || 0,
      first80Chars: r?.extractedContent?.[0]?.text?.substring(0, 80),
      url: r?.url,
      urlType: r?.urlType,
    }, null, 2));
    
    const ok = r?.status === "resolved" && (r as any)?.sourceOrigin === "local_bible" 
      && r?.extractedContent?.[0]?.text?.includes("vida eterna");
    console.log(ok ? "  ✅ PASS" : "  ❌ FAIL");
  }

  // ─── Test 2: w13 15/10 pág. 27 párr. 7 (WOL disabled → unresolved) ───

  console.log("\n── Test 2: w13 15/10 pág. 27 párr. 7 (WOL disabled) ──");
  {
    const { allRefs } = parseAllReferences("w13 15/10 pág. 27 párr. 7");
    const results = await resolveReferences(allRefs);
    const r = results[0];
    console.log(JSON.stringify({
      reference: r?.raw,
      type: r?.type,
      status: r?.status,
      url: r?.url,
      urlType: r?.urlType,
      title: r?.title,
      publication: r?.publication,
      notes: r?.notes,
    }, null, 2));
    
    // WOL is disabled so this should be unresolved
    const ok = r?.status === "unresolved" && r?.type === "wol";
    console.log(ok ? "  ✅ PASS (WOL disabled → unresolved as expected)" : "  ❌ FAIL");
  }

  // ─── Test 3: Mateo 99:99 (Bible invalid → extraction_failed) ───

  console.log("\n── Test 3: Mateo 99:99 (Biblia inválida) ──");
  {
    const { allRefs } = parseAllReferences("Mateo 99:99");
    const results = await resolveReferences(allRefs);
    const r = results[0];
    console.log(JSON.stringify({
      reference: r?.raw,
      status: r?.status,
      sourceOrigin: (r as any)?.sourceOrigin,
      extractedContentLength: r?.extractedContent?.length || 0,
      notes: r?.notes,
    }, null, 2));
    
    const ok = r?.status === "extraction_failed";
    console.log(ok ? "  ✅ PASS" : "  ❌ FAIL");
  }

  // ─── Test 4: Source-gating simulation ───

  console.log("\n── Test 4: Source-gating con Juan 17:3 (válida) + Mateo 99:99 (inválida) ──");
  {
    const message = "¿Qué dice Juan 17:3? (Juan 17:3; Mateo 99:99)";
    const { allRefs } = parseAllReferences(message);
    const resolvedRefs = await resolveReferences(allRefs);

    // Replicate source-gating logic from research-chat.routes.ts
    const userTextOnly = message.replace(/\(.*?\)/g, "").replace(/https?:\/\/\S+/g, "").trim();
    const hasUsableUserText = Boolean(userTextOnly && userTextOnly.length > 100);
    const hasResolvedWolSource = resolvedRefs.some(
      (s) => s.type === "wol" && s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 40
    );
    const hasResolvedBibleSource = resolvedRefs.some(
      (s) => s.type === "bible" && s.status === "resolved" && s.extractedContent && s.extractedContent.length > 0 && s.extractedContent.some((b: any) => b.text && b.text.trim().length > 0)
    );
    const hasAnyUsableSource = hasUsableUserText || hasResolvedWolSource || hasResolvedBibleSource;

    const usedSources = resolvedRefs.filter(
      (s) => (s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 10) ||
             (s.type === "bible" && s.status === "resolved" && s.extractedContent && s.extractedContent.length > 0)
    );
    const detectedButUnusedSources = resolvedRefs.filter(
      (s) => !(
        (s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 10) ||
        (s.type === "bible" && s.status === "resolved" && s.extractedContent && s.extractedContent.length > 0)
      )
    );

    console.log(`  hasUsableUserText: ${hasUsableUserText}`);
    console.log(`  hasResolvedWolSource: ${hasResolvedWolSource}`);
    console.log(`  hasResolvedBibleSource: ${hasResolvedBibleSource}`);
    console.log(`  hasAnyUsableSource: ${hasAnyUsableSource}`);
    console.log(`  usedSources: ${usedSources.length} (${usedSources.map(s => s.raw).join(", ")})`);
    console.log(`  detectedButUnused: ${detectedButUnusedSources.length} (${detectedButUnusedSources.map(s => s.raw).join(", ")})`);

    const ok = hasAnyUsableSource === true 
      && usedSources.length === 1  // Solo Juan 17:3 es usable
      && usedSources[0]?.raw?.includes("Juan 17:3")
      && detectedButUnusedSources.length === 1  // Mateo 99:99 no es usable
      && detectedButUnusedSources[0]?.status === "extraction_failed";
    console.log(ok ? "  ✅ PASS" : "  ❌ FAIL");
  }

  // ─── Test 5: Manual fallback (w15 15/5) ───

  console.log("\n── Test 5: w15 15/5 pág. 29-pág. 30 (fallback manual) ──");
  {
    const { allRefs } = parseAllReferences("w15 15/5 pág. 29-pág. 30");
    const results = await resolveReferences(allRefs);
    const r = results[0];
    console.log(JSON.stringify({
      reference: r?.raw,
      status: r?.status,
      sourceOrigin: (r as any)?.sourceOrigin,
      title: r?.title,
      publication: r?.publication,
      excerptLength: r?.excerpt?.length,
      extractedContentBlocks: r?.extractedContent?.length,
      textLength: r?.extractedContent?.[0]?.text?.length,
    }, null, 2));
    
    const ok = r?.status === "resolved" && (r as any)?.sourceOrigin === "manual_user_verified"
      && (r?.excerpt?.length || 0) > 100;
    console.log(ok ? "  ✅ PASS" : "  ❌ FAIL");
  }

  // ─── Test 6: Full input similar to real usage ───

  console.log("\n── Test 6: Input real completo (Bible local + WOL disabled) ──");
  {
    const message = "¿Por qué conocer a Dios no es solo un proceso intelectual? (Juan 17:3; w13 15/10 pág. 27 párr. 7).";
    const { allRefs } = parseAllReferences(message);
    console.log(`  Referencias parseadas: ${allRefs.length}`);
    allRefs.forEach((r: any) => console.log(`    - ${r.type}: ${r.raw || r.book + " " + r.chapter + ":" + r.verses}`));

    const resolvedRefs = await resolveReferences(allRefs, message);
    
    console.log(`  Resultados:`);
    for (const r of resolvedRefs) {
      console.log(`    ${r.raw}: status=${r.status}, origin=${(r as any).sourceOrigin || "wol"}, text=${r.extractedContent?.[0]?.text?.substring(0, 50) || "(none)"}...`);
    }

    // Bible should be resolved from local
    const bibleRef = resolvedRefs.find(r => r.type === "bible");
    const wolRef = resolvedRefs.find(r => r.type === "wol");
    
    const bibleOk = bibleRef?.status === "resolved" && (bibleRef as any)?.sourceOrigin === "local_bible";
    const wolNote = wolRef?.status === "unresolved" ? "(WOL disabled)" : `(${wolRef?.status})`;
    
    console.log(`\n  Bible (Juan 17:3): ${bibleOk ? "✅ resolved from local_bible" : "❌ FAIL"}`);
    console.log(`  WOL (w13 15/10): ${wolRef?.status} ${wolNote}`);
    console.log(`  → Con WOL habilitado, ambas fuentes tendrían texto real.`);
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("E2E TESTS COMPLETADOS");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch(e => { console.error(e); process.exit(1); });
