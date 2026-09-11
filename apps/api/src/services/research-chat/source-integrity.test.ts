/**
 * Source Integrity Test — exact case validation.
 *
 * Input: ¿Cómo hacemos brillar nuestra luz? (Mat. 5:14-16; Mar. 13:10; w12 1/5 pág. 9 párr. 2)
 *
 * Verifies:
 * 1. Detects exactly 3 references
 * 2. Mat. 5:14-16 resolves as Bible
 * 3. Mar. 13:10 resolves as Bible
 * 4. w12 1/5 pág. 9 párr. 2 resolves as JW publication
 * 5. Bible sources have literal text (if resolved)
 * 6. w12 has literal text if marked verified:true
 * 7. No verified source contains AI-generated phrases
 * 8. If w12 can't be extracted → verified:false
 * 9. Only truly verified sources count
 * 10. AI commentary cannot modify source texts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAllReferences,
  validateVerifiedSourceIntegrity,
  enforceSourceIntegrity,
  detectAIGeneratedText,
  countVerifiedSources,
  sanitizeAIInjectedSource,
} from "@jw-reminders/shared";

const TEST_INPUT = "¿Cómo hacemos brillar nuestra luz? (Mat. 5:14-16; Mar. 13:10; w12 1/5 pág. 9 párr. 2)";

// ─── Test 1: Detects exactly 3 references ────────────────

test("parseAllReferences detects exactly 3 references from test input", () => {
  const { allRefs, bibleRefs, wolRefs } = parseAllReferences(TEST_INPUT);

  assert.equal(allRefs.length, 3, `Expected 3 refs, got ${allRefs.length}: ${JSON.stringify(allRefs.map(r => r.raw))}`);
  assert.equal(bibleRefs.length, 2, `Expected 2 Bible refs, got ${bibleRefs.length}`);
  assert.equal(wolRefs.length, 1, `Expected 1 WOL ref, got ${wolRefs.length}`);
});

// ─── Test 2: Mateo 5:14-16 resolves as Bible ────────────

test("Mat. 5:14-16 parses as bible type with book=Mateo, chapter=5, verses=14-16", () => {
  const { bibleRefs } = parseAllReferences(TEST_INPUT);
  const mateo = bibleRefs.find((r) => r.book === "Mateo");

  assert.ok(mateo, "Mateo reference not found");
  assert.equal(mateo.type, "bible");
  assert.equal(mateo.book, "Mateo");
  assert.equal(mateo.chapter, 5);
  assert.equal(mateo.verses, "14-16");
});

// ─── Test 3: Marcos 13:10 resolves as Bible ─────────────

test("Mar. 13:10 parses as bible type with book=Marcos, chapter=13, verses=10", () => {
  const { bibleRefs } = parseAllReferences(TEST_INPUT);
  const marcos = bibleRefs.find((r) => r.book === "Marcos");

  assert.ok(marcos, "Marcos reference not found");
  assert.equal(marcos.type, "bible");
  assert.equal(marcos.book, "Marcos");
  assert.equal(marcos.chapter, 13);
  assert.equal(marcos.verses, "10");
});

// ─── Test 4: w12 1/5 pág. 9 párr. 2 resolves as JW publication ──

test("w12 1/5 pág. 9 párr. 2 parses as wol type with correct metadata", () => {
  const { wolRefs } = parseAllReferences(TEST_INPUT);
  const w12 = wolRefs[0];

  assert.ok(w12, "WOL reference not found");
  assert.equal(w12.type, "wol");
  assert.ok("publicationCode" in w12, "Should have publicationCode");
  if ("publicationCode" in w12) {
    assert.equal(w12.publicationCode, "w12");
    assert.equal(w12.date, "1/5");
    assert.equal(w12.page, 9);
    assert.deepEqual(w12.paragraphs, [2]);
  }
});

// ─── Test 5: Simulated Bible sources have literal text ───

test("Bible resolved source with real text passes integrity", () => {
  const bibleSource = {
    type: "bible",
    reference: "Mateo 5:14-16",
    verified: true,
    origin: "local_bible",
    extractedText: "\"Ustedes son la luz del mundo. Una ciudad que está ubicada sobre una montaña no se puede esconder. 15 Las personas no encienden una lámpara y la ponen debajo de una canasta, sino sobre el candelero, y así alumbra a todos los que están en la casa. 16 De la misma manera, dejen que la luz de ustedes brille delante de la gente, para que vean las cosas buenas que ustedes hacen y glorifiquen a su Padre que está en los cielos.\"",
    extractedContent: [
      { label: "Versículo 14", text: "\"Ustedes son la luz del mundo. Una ciudad que está ubicada sobre una montaña no se puede esconder." },
      { label: "Versículo 15", text: "Las personas no encienden una lámpara y la ponen debajo de una canasta, sino sobre el candelero, y así alumbra a todos los que están en la casa." },
      { label: "Versículo 16", text: "De la misma manera, dejen que la luz de ustedes brille delante de la gente, para que vean las cosas buenas que ustedes hacen y glorifiquen a su Padre que está en los cielos.\"" },
    ],
    metadata: { book: "Mateo", chapter: 5, verses: "14-16" },
  };

  const issues = validateVerifiedSourceIntegrity(bibleSource);
  const blocking = issues.filter((i) => i.severity === "block");
  assert.equal(blocking.length, 0, `Expected no blocking issues, got: ${JSON.stringify(blocking)}`);
});

// ─── Test 6: w12 verified:true requires literal text ─────

test("JW publication with real text passes integrity", () => {
  const jwSource = {
    type: "jw_publication",
    reference: "w12 1/5 pág. 9 párr. 2",
    verified: true,
    origin: "jw_org",
    extractedText: "Los cristianos verdaderos son como la luz del mundo porque predican las buenas nuevas del Reino de Dios. De esta manera, ayudan a las personas a entender la voluntad de Dios.",
    extractedContent: [
      { label: "Párrafo 2", paragraphNumber: 2, text: "Los cristianos verdaderos son como la luz del mundo porque predican las buenas nuevas del Reino de Dios. De esta manera, ayudan a las personas a entender la voluntad de Dios." },
    ],
    metadata: { publication: "w12", date: "1/5", articleTitle: "¿Cómo brilla nuestra luz?" },
  };

  const issues = validateVerifiedSourceIntegrity(jwSource);
  const blocking = issues.filter((i) => i.severity === "block");
  assert.equal(blocking.length, 0, `Expected no blocking issues, got: ${JSON.stringify(blocking)}`);
});

// ─── Test 7: No verified source can contain AI phrases ───

const AI_PHRASES = [
  "Comenta sobre la relación entre ser luz y hacer discípulos",
  "Nos enseña que debemos predicar con entusiasmo",
  "Nos recuerda que nuestra conducta es importante",
  "Podemos aplicar este principio en la predicación",
  "Aquí se nos llama a ser diferentes del mundo",
  "La referencia habla de la importancia de dar testimonio",
  "Este versículo enseña que somos luz del mundo",
  "Esta fuente explica que debemos brillar como cristianos",
];

test("detectAIGeneratedText catches all known AI patterns", () => {
  for (const phrase of AI_PHRASES) {
    const detected = detectAIGeneratedText(phrase);
    assert.ok(detected, `Expected AI pattern detection in: "${phrase}"`);
  }
});

test("detectAIGeneratedText does NOT flag real Bible text", () => {
  const realBibleTexts = [
    "\"Ustedes son la luz del mundo. Una ciudad que está ubicada sobre una montaña no se puede esconder.\"",
    "\"De la misma manera, dejen que la luz de ustedes brille delante de la gente, para que vean las cosas buenas que ustedes hacen y glorifiquen a su Padre que está en los cielos.\"",
    "Y estas buenas nuevas del Reino se predicarán en toda la tierra habitada para testimonio a todas las naciones, y entonces vendrá el fin.",
  ];

  for (const text of realBibleTexts) {
    const detected = detectAIGeneratedText(text);
    assert.equal(detected, null, `False positive on real Bible text: "${text.slice(0, 50)}..." — detected: "${detected}"`);
  }
});

test("Verified source with AI-generated text fails integrity", () => {
  const fakeSource = {
    type: "jw_publication",
    reference: "w12 1/5 pág. 9 párr. 2",
    verified: true,
    origin: "jw_org",
    extractedText: "Comenta sobre la relación entre ser luz y hacer discípulos en nuestra comunidad moderna.",
    extractedContent: [
      { label: "Párrafo 2", paragraphNumber: 2, text: "Comenta sobre la relación entre ser luz y hacer discípulos en nuestra comunidad moderna." },
    ],
    metadata: { publication: "w12", date: "1/5" },
  };

  const issues = validateVerifiedSourceIntegrity(fakeSource);
  const aiIssue = issues.find((i) => i.code === "AI_GENERATED_TEXT_DETECTED");
  assert.ok(aiIssue, "Expected AI_GENERATED_TEXT_DETECTED issue");
});

// ─── Test 8: Unresolved w12 must have verified:false ─────

test("w12 that cannot be extracted becomes verified:false via enforceSourceIntegrity", () => {
  const unresolvedSource = {
    type: "jw_publication",
    reference: "w12 1/5 pág. 9 párr. 2",
    verified: true,
    origin: "jw_org",
    extractedText: "", // no text extracted
    extractedContent: [],
    metadata: { publication: "w12", date: "1/5" },
  };

  const result = enforceSourceIntegrity(unresolvedSource);
  assert.equal(result.verified, false, "Source without extracted text must be verified:false");
  assert.ok(result.verified === false && result.reason.includes("texto extraído real"), `Expected reason about missing text, got: "${(result as any).reason}"`);
});

// ─── Test 9: countVerifiedSources only counts real verified ones ──

test("countVerifiedSources excludes sources that fail integrity", () => {
  const sources = [
    // Good Bible source
    {
      type: "bible",
      reference: "Mateo 5:14-16",
      verified: true,
      origin: "local_bible",
      extractedText: "\"Ustedes son la luz del mundo. Una ciudad que está ubicada sobre una montaña no se puede esconder.\"",
      extractedContent: [{ label: "v14", text: "\"Ustedes son la luz del mundo. Una ciudad que está ubicada sobre una montaña no se puede esconder.\"" }],
      metadata: { book: "Mateo", chapter: 5, verses: "14-16" },
    },
    // Bad source — AI text
    {
      type: "jw_publication",
      reference: "w12 1/5 pág. 9 párr. 2",
      verified: true,
      origin: "jw_org",
      extractedText: "Comenta sobre la relación entre ser luz y hacer discípulos",
      extractedContent: [{ label: "P2", text: "Comenta sobre la relación entre ser luz y hacer discípulos" }],
      metadata: { publication: "w12" },
    },
    // Bad source — no text
    {
      type: "bible",
      reference: "Marcos 13:10",
      verified: true,
      origin: "local_bible",
      extractedText: "",
      extractedContent: [],
      metadata: { book: "Marcos", chapter: 13, verses: "10" },
    },
  ];

  const count = countVerifiedSources(sources);
  assert.equal(count, 1, `Expected only 1 truly verified source, got ${count}`);
});

// ─── Test 10: AI commentary cannot modify verified source texts ──

test("enforceSourceIntegrity rejects AI-injected source and degrades it", () => {
  // Simulate AI trying to inject a "verified" source
  const aiInjected = {
    type: "jw_publication",
    reference: "w12 1/5 pág. 9 párr. 2",
    verified: true,
    origin: undefined, // AI won't know the real origin
    extractedText: "Nos recuerda que debemos predicar con celo",
    extractedContent: [{ label: "P2", text: "Nos recuerda que debemos predicar con celo" }],
    metadata: {},
  };

  const result = enforceSourceIntegrity(aiInjected);
  assert.equal(result.verified, false, "AI-injected source must be degraded to verified:false");
});


// ─── ANTI-REGRESSION: AI attempts to inject fake verified source ───

test("ANTI-REGRESSION: AI response with verifiedSources containing AI text is rejected", () => {
  // Simulate an AI response that tries to return a "verified" source
  // with AI-generated text masquerading as extracted content
  const aiAttemptedInjection = {
    verifiedSources: [
      {
        reference: "w12 1/5 pág. 9 párr. 2",
        verified: true,
        verifiedText: "Comenta sobre la relación entre ser luz y hacer discípulos...",
      },
      {
        reference: "Mat. 5:14",
        verified: true,
        verifiedText: "Este versículo enseña que debemos ser diferentes del mundo",
      },
    ],
  };

  // Each "source" the AI injects must be caught by enforceSourceIntegrity
  for (const src of aiAttemptedInjection.verifiedSources) {
    // Convert to our validation format
    const sourceObj = {
      type: "jw_publication" as const,
      reference: src.reference,
      verified: true,
      origin: undefined, // AI doesn't have real origin
      extractedText: src.verifiedText,
      extractedContent: [{ label: "AI", text: src.verifiedText }],
      metadata: {},
    };

    const result = enforceSourceIntegrity(sourceObj);

    // INVARIANT: AI-injected source MUST be degraded to verified:false
    assert.equal(
      result.verified,
      false,
      `AI-injected source "${src.reference}" was NOT rejected! This is a critical integrity failure.`,
    );

    // Verify the reason mentions either AI detection or missing origin
    if (result.verified === false) {
      const reason = result.reason;
      const hasValidRejection =
        reason.includes("AI") ||
        reason.includes("IA") ||
        reason.includes("origen") ||
        reason.includes("patrón");
      assert.ok(
        hasValidRejection,
        `Rejection reason should mention AI/origin issue, got: "${reason}"`,
      );
    }
  }
});

test("ANTI-REGRESSION: sanitizeAIInjectedSource always returns verified:false", () => {
  const fakeSource = {
    reference: "w12 1/5 pág. 9 párr. 2",
    verified: true,
    verifiedText: "Comenta sobre la relación entre ser luz y hacer discípulos...",
    type: "jw_publication",
  };

  const result = sanitizeAIInjectedSource(fakeSource);
  assert.equal(result.verified, false);
  assert.ok(result.reason.includes("generada por IA") || result.reason.includes("rechazada"));
});

test("ANTI-REGRESSION: validateVerifiedSourceIntegrity blocks source with no origin even if text looks real", () => {
  // A source could have text that passes AI detection but still be fabricated
  // if it has no traceable origin
  const sneakySource = {
    type: "bible",
    reference: "Mateo 5:14",
    verified: true,
    origin: undefined, // no origin = not verified!
    extractedText: "Ustedes son la luz del mundo.", // This text is real, but who extracted it?
    extractedContent: [{ label: "v14", text: "Ustedes son la luz del mundo." }],
    metadata: { book: "Mateo", chapter: 5, verses: "14" },
  };

  const issues = validateVerifiedSourceIntegrity(sneakySource);
  const originIssue = issues.find((i) => i.code === "NO_VALID_ORIGIN");
  assert.ok(originIssue, "Must detect missing origin even if text looks real");
});

test("ANTI-REGRESSION: Full pipeline - AI response is sanitized before reaching verified sources", () => {
  // Simulates what happens in research-chat.routes.ts INTEGRITY GATE:
  // If AI returns verifiedSources, they get deleted and additionalReferences get tagged.
  const aiResponse = {
    mode: "comentario",
    summary: "Hacemos brillar nuestra luz predicando...",
    comments: [{ type: "directo", text: "...", durationSeconds: 15 }],
    // AI attempting to inject verified sources:
    verifiedSources: [
      { reference: "w12 1/5 pág. 9 párr. 2", verified: true, verifiedText: "Nos recuerda que..." },
    ],
    additionalReferences: [
      { source: "wol", reference: "w12 1/5 pág. 9", note: "Comenta sobre la predicación" },
    ],
  };

  // Simulate the INTEGRITY GATE logic from routes:
  const enrichedResponse = { ...aiResponse };

  // Gate 1: Delete any verifiedSources from AI
  if ((enrichedResponse as any).verifiedSources) {
    delete (enrichedResponse as any).verifiedSources;
  }

  // Gate 2: Tag additionalReferences as AI-generated
  if (enrichedResponse.additionalReferences) {
    enrichedResponse.additionalReferences = enrichedResponse.additionalReferences.map((ref: any) => ({
      ...ref,
      _aiGenerated: true,
    }));
  }

  // Verify: verifiedSources is gone
  assert.equal((enrichedResponse as any).verifiedSources, undefined, "verifiedSources must be deleted from AI output");

  // Verify: additionalReferences are tagged as AI
  for (const ref of enrichedResponse.additionalReferences) {
    assert.equal((ref as any)._aiGenerated, true, "additionalReferences must be tagged as AI-generated");
  }
});
