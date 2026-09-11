/**
 * Source Integrity Types & Validator
 *
 * Enforces hard separation between verified sources (extracted text)
 * and AI-generated commentary. A VerifiedSource NEVER contains AI text.
 *
 * ponytail: one file, no class, no deps. The regex list is the ceiling —
 * if AI patterns evolve, update AI_GENERATED_PATTERNS.
 */

// ─── Strict Types ────────────────────────────────────────

export type SourceOrigin =
  | "local_bible"
  | "local_jw_db"
  | "jw_org"
  | "jw_cache"
  | "manual_user_verified";

export type SourceType = "bible" | "jw_publication";

export interface SourceMetadata {
  book?: string;
  chapter?: number;
  verses?: string;
  publication?: string;
  date?: string;
  articleTitle?: string;
  page?: string;
  paragraph?: string;
  url?: string;
}

/**
 * A VerifiedSource contains ONLY text extracted from a real, traceable source.
 * The AI cannot write, modify, or complete any field in this type.
 */
export interface VerifiedSource {
  id: string;
  type: SourceType;
  reference: string;
  verified: true;
  origin: SourceOrigin;
  extractedText: string;
  extractedContent?: Array<{
    label: string;
    paragraphNumber?: number;
    text: string;
  }>;
  metadata: SourceMetadata;
}

/**
 * An unverified source detected by the parser but not successfully extracted.
 */
export interface UnverifiedSource {
  id: string;
  type: SourceType | string;
  reference: string;
  verified: false;
  reason: string;
  metadata?: Partial<SourceMetadata>;
  url?: string;
}

/**
 * Union: a source is either verified (with real text) or unverified (with reason).
 */
export type ResearchSource = VerifiedSource | UnverifiedSource;

/**
 * AI-generated commentary. The AI writes ONLY here, never in VerifiedSource.
 */
export interface AICommentary {
  direct15s?: string;
  natural30s?: string;
  reasoned50s?: string;
  deep75s?: string;
  summary?: string;
  spiritualReasoning?: string;
  application?: string;
  biblicalBasis?: Array<{ reference: string; explanation: string }>;
  confidenceNote?: string | null;
}

// ─── AI-pattern detection ────────────────────────────────

/**
 * Patterns that indicate AI-generated interpretive text.
 * These phrases NEVER appear in real Bible/publication text.
 * Case-insensitive matching.
 */
const AI_GENERATED_PATTERNS: RegExp[] = [
  /\bcomenta\s+sobre\b/i,
  /\bnos\s+enseña\s+que\b/i,
  /\bnos\s+recuerda\s+que\b/i,
  /\bpodemos\s+aplicar\b/i,
  /\baquí\s+se\s+nos\s+(llama|invita|exhorta)\b/i,
  /\bla\s+referencia\s+habla\s+de\b/i,
  /\besta\s+fuente\s+explica\s+que\b/i,
  /\beste\s+versículo\s+(nos\s+)?enseña\b/i,
  /\beste\s+versículo\s+(nos\s+)?recuerda\b/i,
  /\beste\s+pasaje\s+(nos\s+)?muestra\b/i,
  /\besta\s+publicación\s+destaca\b/i,
  /\bel\s+texto\s+nos\s+(dice|muestra|indica)\b/i,
  /\ben\s+resumen,?\s+(esta|el|la)\s+(fuente|texto|pasaje)\b/i,
  /\bsegún\s+esta\s+fuente\b/i,
  /\bla\s+lección\s+principal\s+es\b/i,
  /\bde\s+esto\s+aprendemos\b/i,
];

/**
 * Checks if a text contains AI-generated interpretive patterns.
 * Returns the first matching pattern or null.
 */
export function detectAIGeneratedText(text: string): string | null {
  if (!text || text.trim().length === 0) return null;
  for (const pattern of AI_GENERATED_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

// ─── Validation ──────────────────────────────────────────

export interface IntegrityIssue {
  code: string;
  message: string;
  severity: "block" | "warn";
}

/**
 * Validates that a source claiming verified:true meets ALL integrity invariants.
 * Returns empty array if valid, or array of issues if invalid.
 *
 * Rules:
 * 1. Must have extractedText or extractedContent with real text.
 * 2. Must have a traceable origin.
 * 3. Must not contain AI-generated interpretive phrases.
 * 4. bible type must have book + chapter + verses in metadata.
 * 5. jw_publication type must have publication + date or articleTitle.
 * 6. extractedText must be non-trivial (>10 chars).
 */
export function validateVerifiedSourceIntegrity(
  source: Record<string, any>,
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  // Rule 1: must have real extracted text
  const extractedText = source.extractedText || "";
  const hasExtractedContent =
    Array.isArray(source.extractedContent) &&
    source.extractedContent.some(
      (p: any) => p.text && p.text.trim().length > 10,
    );

  if (!extractedText && !hasExtractedContent) {
    issues.push({
      code: "NO_EXTRACTED_TEXT",
      message: "Fuente marcada como verificada sin texto extraído real.",
      severity: "block",
    });
  }

  // Rule 2: must have traceable origin
  const validOrigins: string[] = [
    "local_bible",
    "local_jw_db",
    "jw_org",
    "jw_cache",
    "manual_user_verified",
  ];
  if (!source.origin || !validOrigins.includes(source.origin)) {
    // Also accept sourceOrigin for backward compat with existing code
    const sourceOrigin = source.sourceOrigin || source.origin;
    if (!sourceOrigin || !validOrigins.includes(sourceOrigin)) {
      issues.push({
        code: "NO_VALID_ORIGIN",
        message: `Fuente sin origen rastreable válido. Recibido: "${source.origin || source.sourceOrigin || "none"}"`,
        severity: "block",
      });
    }
  }

  // Rule 3: must not contain AI-generated text
  const textsToCheck: string[] = [];
  if (extractedText) textsToCheck.push(extractedText);
  if (Array.isArray(source.extractedContent)) {
    for (const p of source.extractedContent) {
      if (p.text) textsToCheck.push(p.text);
    }
  }
  // Also check fields that should never be AI-generated
  const suspectFields = [
    "verifiedText",
    "paragraphText",
    "sourcePreview",
    "sourceSnippet",
    "referenceSummary",
  ];
  for (const field of suspectFields) {
    if (source[field] && typeof source[field] === "string") {
      textsToCheck.push(source[field]);
    }
  }

  for (const text of textsToCheck) {
    const aiPattern = detectAIGeneratedText(text);
    if (aiPattern) {
      issues.push({
        code: "AI_GENERATED_TEXT_DETECTED",
        message: `Texto con patrón de IA detectado: "${aiPattern}" — no es texto literal extraído.`,
        severity: "block",
      });
      break; // One detection is enough
    }
  }

  // Rule 4: bible must have book + chapter + verses
  if (source.type === "bible") {
    const meta = source.metadata || {};
    if (!meta.book) {
      issues.push({
        code: "BIBLE_NO_BOOK",
        message: "Fuente bíblica sin libro en metadata.",
        severity: "block",
      });
    }
    if (!meta.chapter && meta.chapter !== 0) {
      issues.push({
        code: "BIBLE_NO_CHAPTER",
        message: "Fuente bíblica sin capítulo en metadata.",
        severity: "block",
      });
    }
    if (!meta.verses) {
      issues.push({
        code: "BIBLE_NO_VERSES",
        message: "Fuente bíblica sin versículos en metadata.",
        severity: "block",
      });
    }
  }

  // Rule 5: jw_publication must have publication + date or articleTitle
  if (source.type === "jw_publication") {
    const meta = source.metadata || {};
    if (!meta.publication && !meta.articleTitle) {
      issues.push({
        code: "JW_PUB_NO_IDENTIFIER",
        message:
          "Fuente JW sin publicación ni título de artículo en metadata.",
        severity: "block",
      });
    }
  }

  // Rule 6: text must be non-trivial
  const allTexts = [
    extractedText,
    ...(Array.isArray(source.extractedContent)
      ? source.extractedContent.map((p: any) => p.text || "")
      : []),
  ].filter(Boolean);
  const longestText = allTexts.reduce(
    (a, b) => (a.length > b.length ? a : b),
    "",
  );
  if (longestText.length > 0 && longestText.length <= 10) {
    issues.push({
      code: "TEXT_TOO_SHORT",
      message: `Texto extraído demasiado corto (${longestText.length} chars). Posible snippet incompleto.`,
      severity: "warn",
    });
  }

  return issues;
}

/**
 * Determines if a source passes integrity validation for verified:true status.
 * If it fails, returns a degraded UnverifiedSource instead.
 */
export function enforceSourceIntegrity(
  source: Record<string, any>,
): ResearchSource {
  // If already marked as unverified, pass through
  if (source.verified === false) {
    return {
      id: source.id || crypto.randomUUID(),
      type: source.type || "bible",
      reference: source.reference || "unknown",
      verified: false,
      reason: source.reason || "No se pudo extraer el texto literal de la referencia.",
      metadata: source.metadata,
      url: source.url,
    };
  }

  const issues = validateVerifiedSourceIntegrity(source);
  const blockingIssues = issues.filter((i) => i.severity === "block");

  if (blockingIssues.length > 0) {
    // Degrade to unverified
    return {
      id: source.id || crypto.randomUUID(),
      type: source.type || "bible",
      reference: source.reference || "unknown",
      verified: false,
      reason: blockingIssues.map((i) => i.message).join(" | "),
      metadata: source.metadata,
      url: source.url,
    };
  }

  // Passes — return as VerifiedSource
  return {
    id: source.id || crypto.randomUUID(),
    type: source.type as SourceType,
    reference: source.reference,
    verified: true,
    origin: (source.origin || source.sourceOrigin) as SourceOrigin,
    extractedText:
      source.extractedText ||
      (Array.isArray(source.extractedContent)
        ? source.extractedContent.map((p: any) => p.text).join("\n")
        : ""),
    extractedContent: source.extractedContent,
    metadata: source.metadata || {},
  };
}

/**
 * Counts only truly verified sources (those that pass full integrity check).
 */
export function countVerifiedSources(sources: Record<string, any>[]): number {
  return sources.filter((s) => {
    if (!s.verified && s.verified !== true) return false;
    const issues = validateVerifiedSourceIntegrity(s);
    return issues.filter((i) => i.severity === "block").length === 0;
  }).length;
}

/**
 * Strips any AI-injected data from a source object.
 * If the AI response includes verifiedSources, this sanitizes them.
 */
export function sanitizeAIInjectedSource(
  aiSource: Record<string, any>,
): UnverifiedSource {
  // AI cannot be authority over verified sources — always degrade
  return {
    id: crypto.randomUUID(),
    type: (aiSource.type as SourceType) || "jw_publication",
    reference: aiSource.reference || "unknown",
    verified: false,
    reason:
      "Fuente rechazada: generada por IA, no extraída de fuente real.",
    metadata: {},
  };
}
