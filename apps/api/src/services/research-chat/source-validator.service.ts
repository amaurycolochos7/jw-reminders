/**
 * Source Validator — HARDENED version with AI-text detection.
 *
 * Uses source-integrity from @jw-reminders/shared to enforce the invariant:
 * "A verified source contains ONLY extracted text from a real source, never AI-generated text."
 *
 * ponytail: single guard, one pass. Delegates detection logic to shared package.
 * The ceiling is the AI_GENERATED_PATTERNS list — false negatives possible if
 * AI uses novel phrasing. Upgrade path: add patterns to shared/source-integrity.ts.
 */

import {
  validateVerifiedSourceIntegrity,
  detectAIGeneratedText,
  type IntegrityIssue,
} from "@jw-reminders/shared";

export interface ValidatedSource {
  reference: string;
  type: string;
  status: string;
  sourceOrigin?: string;
  title?: string;
  publication?: string;
  url?: string;
  urlType?: string;
  extractedContent?: Array<{
    label: string;
    paragraphNumber?: number;
    text: string;
    highlights?: Array<{ text: string; reason?: string }>;
  }>;
  // Integrity result
  isVerified: boolean;
  integrityPassed: boolean;
  validationIssue?: string;
}

export interface ValidationResult {
  validSources: ValidatedSource[];
  invalidSources: Array<{
    reference: string;
    type: string;
    issue: string;
  }>;
  totalValid: number;
  totalInvalid: number;
}

/**
 * Maps resolver sourceOrigin values to integrity-compatible values.
 */
function normalizeOrigin(source: any): string | undefined {
  const origin = source.sourceOrigin || source.origin;
  if (!origin) return undefined;
  // Map from resolver naming to integrity naming
  const map: Record<string, string> = {
    local_bible: "local_bible",
    wol_bible: "jw_org",
    wol_article: "jw_org",
    manual_user_verified: "manual_user_verified",
    precursor_metadata: "local_jw_db",
    none: "",
  };
  const mapped = map[origin];
  // ponytail: if mapped to empty string, return undefined (means invalid origin)
  if (mapped === "") return undefined;
  return mapped !== undefined ? mapped : origin;
}

/**
 * Builds metadata from resolver output for integrity validation.
 */
function buildMetadataFromSource(source: any): Record<string, any> {
  const metadata: Record<string, any> = {};

  if (source.type === "bible") {
    // Parse reference "Mateo 5:14-16" → book=Mateo, chapter=5, verses=14-16
    const ref = source.reference || source.raw || "";
    const bibleMatch = ref.match(/^(.+?)\s+(\d+):(.+)$/);
    if (bibleMatch) {
      metadata.book = bibleMatch[1];
      metadata.chapter = parseInt(bibleMatch[2], 10);
      metadata.verses = bibleMatch[3];
    }
  } else if (source.type === "wol" || source.type === "wol_link") {
    metadata.publication = source.publication || source.title;
    metadata.articleTitle = source.title;
    if (source.url) metadata.url = source.url;
  }

  return metadata;
}

/**
 * Validates an array of used sources with FULL integrity checks.
 * Sources that fail integrity are downgraded (never counted as verified).
 */
export function validateSources(sources: any[]): ValidationResult {
  const validSources: ValidatedSource[] = [];
  const invalidSources: ValidationResult["invalidSources"] = [];

  for (const source of sources) {
    const issues: string[] = [];

    // ─── Basic required fields ───────────────────────────
    if (!source.reference || typeof source.reference !== "string") {
      issues.push("missing_reference");
    }
    if (!source.type || typeof source.type !== "string") {
      issues.push("missing_type");
    }
    if (source.status !== "resolved") {
      issues.push(`status_not_resolved: ${source.status}`);
    }

    // ─── Type-specific validation ────────────────────────
    if (source.type === "bible") {
      if (!source.extractedContent || source.extractedContent.length === 0) {
        issues.push("bible_no_extracted_content");
      } else {
        const hasRealText = source.extractedContent.some(
          (p: any) => p.text && p.text.trim().length > 10,
        );
        if (!hasRealText) {
          issues.push("bible_no_real_text");
        }
      }
      if (!source.url) {
        issues.push("bible_no_url");
      }
    } else if (source.type === "wol" || source.type === "wol_link") {
      if (!source.extractedContent || source.extractedContent.length === 0) {
        if (!source.url) {
          issues.push("wol_no_content_and_no_url");
        }
      } else {
        const hasRealText = source.extractedContent.some(
          (p: any) => p.text && p.text.trim().length > 20,
        );
        if (!hasRealText) {
          issues.push("wol_content_too_short");
        }
      }
    }

    // ─── AI-GENERATED TEXT DETECTION (NEW) ───────────────
    // Check ALL text content for AI patterns
    if (source.extractedContent && Array.isArray(source.extractedContent)) {
      for (const paragraph of source.extractedContent) {
        if (paragraph.text) {
          const aiPattern = detectAIGeneratedText(paragraph.text);
          if (aiPattern) {
            issues.push(`ai_text_detected: "${aiPattern}" in extractedContent`);
            break;
          }
        }
      }
    }
    // Check excerpt if present
    if (source.excerpt) {
      const aiPattern = detectAIGeneratedText(source.excerpt);
      if (aiPattern) {
        issues.push(`ai_text_detected: "${aiPattern}" in excerpt`);
      }
    }

    // ─── FULL INTEGRITY VALIDATION (NEW) ─────────────────
    // Build integrity-compatible source object for deep validation
    if (issues.length === 0) {
      const integritySource = {
        type: source.type === "wol" || source.type === "wol_link" ? "jw_publication" : source.type,
        reference: source.reference,
        verified: true,
        origin: normalizeOrigin(source),
        sourceOrigin: normalizeOrigin(source),
        extractedText: source.extractedContent
          ? source.extractedContent.map((p: any) => p.text).join("\n")
          : source.excerpt || "",
        extractedContent: source.extractedContent,
        metadata: buildMetadataFromSource(source),
      };

      const integrityIssues = validateVerifiedSourceIntegrity(integritySource);
      const blockingIssues = integrityIssues.filter((i: IntegrityIssue) => i.severity === "block");

      if (blockingIssues.length > 0) {
        issues.push(
          ...blockingIssues.map((i: IntegrityIssue) => `integrity: ${i.code}`),
        );
      }
    }

    // ─── Result ──────────────────────────────────────────
    if (issues.length === 0) {
      validSources.push({
        ...source,
        isVerified: true,
        integrityPassed: true,
      });
    } else {
      invalidSources.push({
        reference: source.reference || "unknown",
        type: source.type || "unknown",
        issue: issues.join(", "),
      });
    }
  }

  return {
    validSources,
    invalidSources,
    totalValid: validSources.length,
    totalInvalid: invalidSources.length,
  };
}
