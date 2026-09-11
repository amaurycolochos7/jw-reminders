/**
 * Compound Question Parser
 *
 * Detects multiple questions, intents, and sub-parts within a single user input.
 * Used to ensure the AI responds to ALL parts of a compound question.
 *
 * ponytail: regex-based, no NLP library. The ceiling is complex
 * multi-sentence questions without explicit "?" — upgrade path: LLM pre-pass.
 */

// ─── Types ───────────────────────────────────────────────

export type QuestionIntent =
  | "reason"          // ¿Por qué...?
  | "method"          // ¿Cómo...? (general)
  | "personal_application" // ¿Cómo lo harías tú? / ¿Cómo has pensado hacerlo?
  | "lesson"          // ¿Qué aprendemos...?
  | "teaching"        // ¿Qué nos enseña...?
  | "example"         // Ponga un ejemplo / Dé un ejemplo
  | "explanation"     // Explique / Explica
  | "effect"          // ¿Qué efecto tiene...?
  | "definition"      // ¿Qué es...? / ¿Quién es...?
  | "comparison"      // ¿Cuál es la diferencia...?
  | "general";        // Fallback

export interface DetectedQuestion {
  id: string;
  text: string;
  intent: QuestionIntent;
}

export interface CompoundQuestionResult {
  /** The full original input without references */
  mainQuestion: string;
  /** Individual sub-questions detected */
  subQuestions: DetectedQuestion[];
  /** Explicit references found (raw text) */
  explicitReferences: string[];
  /** Whether a personal response is expected */
  requiresPersonalApplication: boolean;
  /** Total question count */
  questionCount: number;
}

// ─── Intent Classification ───────────────────────────────

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: QuestionIntent }> = [
  // Personal application must be checked FIRST (most specific)
  { pattern: /c[oó]mo\s+(has|he|puedo|puedes|podr[ií]a|piensas?|pensado)/i, intent: "personal_application" },
  { pattern: /c[oó]mo\s+lo\s+(har[ií]a|haces|hago|aplica)/i, intent: "personal_application" },
  { pattern: /hacerlo\s+t[uú]/i, intent: "personal_application" },
  { pattern: /en\s+(mi|tu)\s+caso/i, intent: "personal_application" },
  { pattern: /t[uú]\b.*\bhas\b/i, intent: "personal_application" },
  // Reason patterns (por qué — accent-safe, no trailing \b)
  { pattern: /por\s+qu[eé]/i, intent: "reason" },
  // Method (general how)
  { pattern: /\bc[oó]mo\s+podemos\b/i, intent: "method" },
  { pattern: /\bc[oó]mo\b/i, intent: "method" },
  // Lesson / teaching
  { pattern: /\bqu[eé]\s+(aprendemos|aprendo|aprendes)/i, intent: "lesson" },
  { pattern: /\bqu[eé]\s+(nos\s+)?ense[ñn]a/i, intent: "teaching" },
  // Examples and explanations
  { pattern: /\bponga\s+un\s+ejemplo/i, intent: "example" },
  { pattern: /\bd[eé]\s+un\s+ejemplo/i, intent: "example" },
  { pattern: /\bexplique\b/i, intent: "explanation" },
  { pattern: /\bexplica\b/i, intent: "explanation" },
  // Effect
  { pattern: /\bqu[eé]\s+efecto/i, intent: "effect" },
  // Definition (check AFTER reason/method to avoid false captures)
  { pattern: /\bqu[eé]\s+(es|son|significa)\b/i, intent: "definition" },
  { pattern: /\bqui[eé]n\s+(es|fue)\b/i, intent: "definition" },
  { pattern: /\bcu[aá]l\s+es\s+la\s+diferencia/i, intent: "comparison" },
];

function classifyIntent(text: string): QuestionIntent {
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return "general";
}

// ─── Reference Stripping ─────────────────────────────────

/**
 * Strips parenthetical references from the end of the input.
 * e.g. "(Mat. 5:14-16; w12 1/5 pág. 9)" → removed
 */
function stripTrailingReferences(text: string): { cleaned: string; refBlock: string } {
  // Match trailing parenthetical block that looks like references
  const refBlockRegex = /\s*\(([^)]+)\)\s*\.?\s*$/;
  const match = text.match(refBlockRegex);
  if (match) {
    // Verify it contains reference-like content (has numbers, slashes, dots typical of refs)
    const content = match[1];
    const looksLikeRef = /\d+[:/]|\bp[aá]g|\bp[aá]rr|\bMat|\bMar|\bJuan|\bRom|\bHeb|\bSal|\bProv/i.test(content);
    if (looksLikeRef) {
      return {
        cleaned: text.slice(0, match.index).trim(),
        refBlock: content,
      };
    }
  }
  return { cleaned: text, refBlock: "" };
}

/**
 * Extracts explicit reference strings from a reference block.
 * e.g. "Mat. 5:14-16; Mar. 13:10; w12 1/5 pág. 9 párr. 2" → ["Mat. 5:14-16", "Mar. 13:10", "w12 1/5 pág. 9 párr. 2"]
 */
function splitReferences(refBlock: string): string[] {
  if (!refBlock) return [];
  return refBlock
    .split(/\s*;\s*/)
    .map((r) => r.trim())
    .filter((r) => r.length > 2);
}

// ─── Question Splitting ──────────────────────────────────

/**
 * Splits text into individual questions.
 * Handles: "?" separator, "a)" / "b)" prefixes, and imperative sentences.
 */
function splitQuestions(text: string): string[] {
  // Strategy 1: Split by "?" keeping each question
  const byQuestionMark = text.split(/(?<=\?)\s+/);

  if (byQuestionMark.length > 1) {
    // Each part should contain a "?" or be an imperative
    return byQuestionMark
      .map((q) => q.trim())
      .filter((q) => q.length > 5);
  }

  // Strategy 2: Look for sub-part markers a), b), etc.
  const subPartRegex = /(?:^|\n)\s*[a-z]\)\s*/i;
  if (subPartRegex.test(text)) {
    const parts = text.split(/(?:^|\n)\s*[a-z]\)\s*/i).filter((p) => p.trim().length > 5);
    if (parts.length > 1) return parts.map((p) => p.trim());
  }

  // Strategy 3: Look for imperative sentences after a question
  const imperativeAfterQuestion = text.match(
    /^(.+\?)\s+(Explique|Ponga|Dé|Mencione|Comente|Describa|Analice)\b(.+)/i,
  );
  if (imperativeAfterQuestion) {
    return [
      imperativeAfterQuestion[1].trim(),
      (imperativeAfterQuestion[2] + imperativeAfterQuestion[3]).trim(),
    ];
  }

  // Single question
  return [text];
}

// ─── Main Parser ─────────────────────────────────────────

/**
 * Parses a user input into its compound question components.
 */
export function parseCompoundQuestion(input: string): CompoundQuestionResult {
  // Step 1: Strip trailing reference block
  const { cleaned, refBlock } = stripTrailingReferences(input);
  const explicitReferences = splitReferences(refBlock);

  // Step 2: Split into individual questions
  const questions = splitQuestions(cleaned);

  // Step 3: Classify each question
  const subQuestions: DetectedQuestion[] = questions.map((q, i) => ({
    id: `q${i + 1}`,
    text: q.replace(/\.$/, "").trim(),
    intent: classifyIntent(q),
  }));

  // Step 4: Check if personal application is required
  const requiresPersonalApplication = subQuestions.some(
    (q) => q.intent === "personal_application",
  );

  return {
    mainQuestion: cleaned,
    subQuestions,
    explicitReferences,
    requiresPersonalApplication,
    questionCount: subQuestions.length,
  };
}

// ─── Source Status ───────────────────────────────────────

export type SourceVerificationStatus =
  | "VERIFIED"       // All explicit refs resolved with real text
  | "PARTIAL"        // Some refs resolved, some not
  | "UNVERIFIED"     // No explicit ref could be resolved
  | "AI_SUGGESTED";  // No explicit refs given, only AI suggestions

/**
 * Determines source verification status based on explicit references and resolution results.
 */
export function determineSourceStatus(
  explicitRefCount: number,
  resolvedCount: number,
  unresolvedCount: number,
): SourceVerificationStatus {
  if (explicitRefCount === 0) return "AI_SUGGESTED";
  if (unresolvedCount === 0 && resolvedCount > 0) return "VERIFIED";
  if (resolvedCount > 0 && unresolvedCount > 0) return "PARTIAL";
  return "UNVERIFIED";
}

// ─── Response Validator ──────────────────────────────────

export interface ResponseValidation {
  questionCount: number;
  answeredQuestions: number;
  explicitReferencesResolved: boolean;
  hasContradictorySourceStatus: boolean;
  usesInventedSources: boolean;
  personalApplicationIncluded: boolean;
  issues: string[];
  passed: boolean;
}

/**
 * Validates that the AI response covers all detected questions and doesn't
 * have contradictory source status.
 */
export function validateResponseCoverage(
  parsedInput: CompoundQuestionResult,
  responseText: string,
  sourceStatus: SourceVerificationStatus,
  usedSourceCount: number,
  unresolvedExplicitCount: number,
): ResponseValidation {
  const issues: string[] = [];

  // Check question coverage (heuristic: each sub-question's key terms should appear in response)
  let answeredCount = 0;
  for (const q of parsedInput.subQuestions) {
    // Extract 2-3 key content words from the question
    const keywords = q.text
      .replace(/[¿?¡!.,;:()]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 3);

    // At least 1 keyword should appear in response
    const covered = keywords.length === 0 || keywords.some(
      (kw) => responseText.toLowerCase().includes(kw.toLowerCase()),
    );
    if (covered) answeredCount++;
  }

  if (answeredCount < parsedInput.questionCount) {
    issues.push(
      `Solo ${answeredCount} de ${parsedInput.questionCount} preguntas fueron cubiertas en la respuesta.`,
    );
  }

  // Check contradictory source status
  const hasContradiction =
    usedSourceCount > 0 && unresolvedExplicitCount > 0 && parsedInput.explicitReferences.length > 0;
  if (hasContradiction) {
    issues.push(
      "Contradicción: se muestran fuentes usadas pero hay referencias explícitas no resueltas.",
    );
  }

  // Check personal application
  const personalIncluded =
    !parsedInput.requiresPersonalApplication ||
    /\b(mi caso|yo |he pensado|puedo|podría|en lo personal|personalmente)\b/i.test(responseText);
  if (parsedInput.requiresPersonalApplication && !personalIncluded) {
    issues.push("La pregunta requiere aplicación personal pero la respuesta no la incluye.");
  }

  return {
    questionCount: parsedInput.questionCount,
    answeredQuestions: answeredCount,
    explicitReferencesResolved: unresolvedExplicitCount === 0,
    hasContradictorySourceStatus: hasContradiction,
    usesInventedSources: false, // Checked elsewhere by source-integrity
    personalApplicationIncluded: personalIncluded,
    issues,
    passed: issues.length === 0,
  };
}
