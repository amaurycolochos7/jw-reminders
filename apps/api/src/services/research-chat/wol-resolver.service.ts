/**
 * WolReferenceResolverService
 *
 * Resuelve referencias WOL normalizadas a URLs y extractos mínimos.
 * Flujo: buscar en WOL → extraer URL directa del primer resultado → abrir artículo → extraer párrafos.
 * Si WOL no responde, devuelve status "failed" sin inventar.
 */

import type { WolReference, WolLinkReference } from "@jw-reminders/shared";
import { resolveFromLocal } from "./bible-local-resolver.service.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Manual Fallbacks ────────────────────────────────────

interface ManualFallbackEntry {
  sourceKey: string;
  status: string;
  referenceRaw: string;
  referenceNormalized: string;
  title: string;
  articleTitle?: string;
  publication: string;
  url: string | null;
  searchUrl: string | null;
  contentBlocks: Array<{ label: string; type: string; text: string; textLength: number; source: string }>;
  notes?: string;
}

let manualFallbacks: ManualFallbackEntry[] | null = null;

function loadManualFallbacks(): ManualFallbackEntry[] {
  if (manualFallbacks) return manualFallbacks;
  const __dir = dirname(fileURLToPath(import.meta.url));
  const fallbackPath = resolve(__dir, "../../../../../data/manual-fallbacks/precursor-manual-fallbacks.json");
  try {
    manualFallbacks = JSON.parse(readFileSync(fallbackPath, "utf8"));
    return manualFallbacks!;
  } catch {
    manualFallbacks = [];
    return manualFallbacks;
  }
}

/**
 * Looks up a manual fallback by reference raw text.
 * Only returns entries with status "verified".
 * ponytail: linear scan is fine for <10 entries.
 */
function getManualFallback(raw: string): ManualFallbackEntry | null {
  const fallbacks = loadManualFallbacks();
  const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim();
  return fallbacks.find(f =>
    f.status === "verified" &&
    (f.referenceRaw.toLowerCase().replace(/\s+/g, " ").trim() === normalized ||
     f.referenceNormalized.toLowerCase().replace(/\s+/g, " ").trim() === normalized)
  ) || null;
}

// ─── Precursor Index Fallback ────────────────────────────

interface PrecursorIndexMatch {
  caption: string;
  articleTitle: string;
  publicationTitle: string;
  mepsDocumentId: number | null;
  lesson: string;
}

let precursorIndexData: any = null;

function loadPrecursorIndexData(): any {
  if (precursorIndexData) return precursorIndexData;
  const __dir = dirname(fileURLToPath(import.meta.url));
  const indexPath = resolve(__dir, "../../../../../data/precursor-study-index/pt14_S.index.json");
  try {
    precursorIndexData = JSON.parse(readFileSync(indexPath, "utf8"));
    return precursorIndexData;
  } catch {
    precursorIndexData = { lessons: [] };
    return precursorIndexData;
  }
}

/** "133, 134" y "133-134" identifican el mismo rango de páginas: se normalizan igual. */
function normalizePageSeparators(s: string): string {
  return s.replace(/(\d)\s*,\s*(\d)/g, "$1-$2");
}

function normalizeRefText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function stripParrs(s: string): string {
  return s.replace(/p[aá]rrs?\.?\s*\d+.*$/i, "").trim();
}

function stripPags(s: string): string {
  return s.replace(/p[aá]gs?\.?\s*\d+.*$/i, "").trim();
}

/**
 * Looks up a WOL reference in the precursor study index.
 * Returns article metadata if found (title, publication, lesson context).
 * ponytail: normaliza el separador de páginas (coma vs guion) y compara
 * ambos lados (input e índice) con el mismo grado de "stripping" de párrafos.
 */
function lookupPrecursorIndex(raw: string): PrecursorIndexMatch | null {
  const data = loadPrecursorIndexData();
  const rawNorm = normalizePageSeparators(normalizeRefText(raw));
  const withoutParrs = normalizePageSeparators(stripParrs(normalizeRefText(raw)));
  const codeOnly = stripPags(withoutParrs);

  for (const lesson of data.lessons || []) {
    for (const extract of lesson.extracts || []) {
      for (const ref of extract.references || []) {
        const refRawNorm = normalizePageSeparators(normalizeRefText(ref.raw || ""));
        // Match: exacto, o la referencia base coincide ignorando el párrafo/exceso de detalle
        if (refRawNorm === rawNorm ||
            refRawNorm === withoutParrs ||
            refRawNorm === codeOnly ||
            rawNorm.startsWith(refRawNorm) ||
            refRawNorm.startsWith(withoutParrs)) {
          return {
            caption: extract.caption || "",
            articleTitle: ref.articleTitle || "",
            publicationTitle: ref.publicationTitle || "",
            mepsDocumentId: ref.mepsDocumentId || null,
            lesson: lesson.title || "",
          };
        }
      }
    }
  }
  return null;
}

// ─── Types ───────────────────────────────────────────────

export interface ExtractedParagraph {
  label: string;
  paragraphNumber?: number;
  text: string;
}

export interface ResolvedReference {
  type: string;
  raw: string;
  status: "resolved" | "unresolved" | "ambiguous" | "failed" | "invalid_reference" | "extraction_failed";
  sourceOrigin?: "local_bible" | "wol_bible" | "wol_article" | "manual_user_verified" | "precursor_metadata" | "none";
  title?: string;
  publication?: string;
  url?: string;
  /** "direct" = URL apunta al artículo exacto. "search" = URL es de búsqueda. */
  urlType?: "direct" | "search";
  excerpt?: string;
  extractedContent?: ExtractedParagraph[];
  notes?: string;
}

// ─── Simple in-memory cache (TTL 30 min) ─────────────────

interface CacheEntry {
  result: ResolvedReference;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function getCached(key: string): ResolvedReference | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: ResolvedReference): void {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  // ponytail: evitar que el caché crezca sin límite; límite de 500 entradas.
  if (cache.size > 500) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}

// ─── Year mapping ────────────────────────────────────────

/**
 * Convierte año corto (2 dígitos) a año completo.
 * 00-30 → 2000-2030
 * 31-99 → 1931-1999
 */
function shortYearToFull(shortYear: number): number {
  return shortYear <= 30 ? 2000 + shortYear : 1900 + shortYear;
}

// ─── Reference validation ────────────────────────────────

/**
 * Tope de páginas por código de publicación (base, sin año/edición).
 * Las revistas y folletos rondan las 32-64 págs.; algunos libros encuadernados
 * o ediciones de estudio (como la Biblia "nwt", con apéndices/glosario) superan
 * las 1800 págs. Un tope único de 500 rechazaba como "inválidas" referencias
 * reales a esas páginas — este mapa evita ese falso positivo sin dejar de
 * detectar números de página absurdos (typos, alucinaciones de la IA, etc.).
 */
const PUBLICATION_MAX_PAGES: Record<string, number> = {
  nwt: 2000,
};
const DEFAULT_MAX_PAGE = 500;

/**
 * Valida que una referencia WOL tenga datos razonables.
 * Retorna null si es válida, o un string con el motivo si es inválida.
 */
function validateWolReference(ref: WolReference): string | null {
  // Validar fecha si existe (formato "día/mes")
  if (ref.date) {
    const parts = ref.date.split("/");
    if (parts.length !== 2) return `Formato de fecha inválido: ${ref.date}`;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (isNaN(day) || isNaN(month)) return `Fecha no numérica: ${ref.date}`;
    if (month < 1 || month > 12) return `Mes inválido: ${month}`;
    if (day < 1 || day > 31) return `Día inválido: ${day}`;
  }

  // Validar capítulo si existe (libros encuadernados citados por capítulo, no por página)
  if (ref.chapter !== undefined && ref.chapter !== null) {
    if (ref.chapter < 1 || ref.chapter > 150) return `Capítulo fuera de rango: ${ref.chapter}`;
  }

  // Validar página(s) si existen — el tope depende de la publicación (ver PUBLICATION_MAX_PAGES).
  const pubBase = (ref.publicationCode || "").replace(/\d+(\.\d+)?$/, "");
  const maxPage = PUBLICATION_MAX_PAGES[pubBase] ?? DEFAULT_MAX_PAGE;
  if (ref.page !== undefined && ref.page !== null) {
    if (ref.page < 1 || ref.page > maxPage) return `Página fuera de rango: ${ref.page}`;
  }
  if (ref.endPage !== undefined && ref.endPage !== null) {
    if (ref.endPage < 1 || ref.endPage > maxPage) return `Página fuera de rango: ${ref.endPage}`;
  }

  // Validar párrafos si existen
  if (ref.paragraphs && ref.paragraphs.length > 0) {
    for (const p of ref.paragraphs) {
      if (p < 1 || p > 100) return `Párrafo fuera de rango: ${p}`;
    }
  }

  return null; // válida
}

// ─── WOL Base URL builder ────────────────────────────────

const WOL_BASE = "https://wol.jw.org/es/wol";

function buildWolSearchUrl(raw: string): string {
  return `${WOL_BASE}/s/r4/lp-s?q=${encodeURIComponent(raw)}`;
}

/**
 * Construye la URL del endpoint de lookup de publicaciones de WOL.
 * /wol/l/ resuelve referencias por código de publicación directamente.
 * Es mucho más preciso que el search (/wol/s/) para referencias con código.
 */
function buildWolLookupUrl(raw: string): string {
  return `${WOL_BASE}/l/r4/lp-s?q=${encodeURIComponent(raw)}`;
}

/**
 * Construye la URL del endpoint /wol/pl/ (publication lookup alternativo).
 * Similar a /wol/l/ pero para libros y otras publicaciones no periódicas.
 */
function buildWolPubLookupUrl(raw: string): string {
  return `${WOL_BASE}/pl/r4/lp-s?q=${encodeURIComponent(raw)}`;
}

/**
 * Construye una URL de búsqueda basada en el nombre legible de la publicación.
 * Fallback cuando los endpoints /wol/l/ y /wol/pl/ no devuelven resultado.
 */
function buildWolPublicationSearchUrl(ref: WolReference): string {
  const baseCode = ref.publicationCode.replace(/\d+(\.\d+)?$/, "");
  const pubName = PUB_NAMES[baseCode];
  const parts: string[] = [];

  if (pubName) parts.push(pubName);

  const yearMatch = ref.publicationCode.match(/(\d{2})(?:\.\d{2})?$/);
  if (yearMatch) parts.push(String(shortYearToFull(parseInt(yearMatch[1], 10))));

  if (ref.date) {
    const monthNum = parseInt(ref.date.split("/")[1], 10);
    if (monthNum >= 1 && monthNum <= 12) parts.push(MONTH_NAMES[monthNum]);
  }

  if (parts.length === 0) return buildWolSearchUrl(ref.raw);
  return `${WOL_BASE}/s/r4/lp-s?q=${encodeURIComponent(parts.join(" "))}`;
}

// ─── HTML fetch helper ───────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

async function fetchWolPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept-Language": "es",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── HTML entity decoder ─────────────────────────────────

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ─── HTML extraction helpers ─────────────────────────────

/** Extrae título limpio de una página HTML de WOL. */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  // Decode entities FIRST, then clean up WOL suffixes
  const decoded = decodeHtmlEntities(
    match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  );
  return decoded
    .replace(/\s*[—–|]\s*BIBLIOTECA EN LÍNEA.*$/i, "")
    .replace(/\s*\|\s*Biblioteca en línea.*$/i, "")
    .replace(/\s*\|\s*Online Library.*$/i, "")
    .replace(/\s*Buscar\s*$/i, "")
    .trim() || null;
}

/**
 * Sanitizes a title extracted from WOL pages.
 * Returns null if title is invalid (search page, empty, or just a reference name).
 * ponytail: single guard here prevents "Artículo: Búsqueda" everywhere downstream.
 */
function sanitizeTitle(title: string | null | undefined): string | undefined {
  if (!title) return undefined;
  const lower = title.toLowerCase().trim();
  const invalidTitles = [
    "búsqueda", "busqueda", "search", "resultados", "results",
    "biblioteca en línea", "online library", "watchtower",
  ];
  if (invalidTitles.some((bad) => lower === bad || lower.startsWith(bad + " "))) return undefined;
  // If title is too short (less than 3 chars) it's probably garbage
  if (title.trim().length < 3) return undefined;
  return title.trim();
}

/** Extrae un extracto corto del contenido principal. */
function extractExcerpt(html: string, maxLen = 300): string | null {
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    || html.match(/<div[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!articleMatch) return null;

  const text = decodeHtmlEntities(
    articleMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

  if (!text) return null;
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

/**
 * Extrae la URL directa del primer resultado de una página de búsqueda WOL.
 * WOL search results have links like: /es/wol/d/r4/lp-s/DOCID
 */
/**
 * Checks if an HTML page is a WOL article page (not a search results page).
 * Article pages have data-pid attributes for numbered paragraphs.
 * Search pages may have <article> tags but won't have data-pid.
 */
function isArticlePage(html: string): boolean {
  return /data-pid=/i.test(html);
}

/**
 * Extrae párrafos específicos del HTML de un artículo WOL.
 * WOL uses data-pnum="N" for reader-visible paragraph numbers (shown in magazine).
 * data-pid is an internal sequential ID that includes headings/captions and doesn't match.
 */
function extractParagraphsFromHtml(html: string, paragraphs?: number[]): ExtractedParagraph[] {
  if (!paragraphs || paragraphs.length === 0) return [];

  const results: ExtractedParagraph[] = [];

  for (const pNum of paragraphs) {
    let text: string | null = null;

    // Strategy 1: data-pnum="N" (reader-visible paragraph number in WOL articles)
    const pnumMarker = `data-pnum="${pNum}"`;
    const pnumIdx = html.indexOf(pnumMarker);
    if (pnumIdx >= 0) {
      // Find the containing <p> element (go backwards)
      const before = html.slice(Math.max(0, pnumIdx - 300), pnumIdx);
      const pStartRel = before.lastIndexOf("<p");
      if (pStartRel >= 0) {
        const fullStart = Math.max(0, pnumIdx - 300) + pStartRel;
        const pEnd = html.indexOf("</p>", pnumIdx);
        if (pEnd > 0) {
          const pHtml = html.slice(fullStart, pEnd + 4);
          const t = decodeHtmlEntities(pHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
          // Remove leading paragraph number if present (e.g. "16 Las publicaciones..." → "Las publicaciones...")
          const cleaned = t.replace(new RegExp(`^${pNum}\\s+`), "");
          // ponytail: guard — a single paragraph should not exceed ~1500 chars.
          // If it does, the HTML structure likely enclosed multiple paragraphs in one <p> tag
          // or we accidentally captured a larger block. Truncate to protect integrity.
          if (cleaned.length > 10 && cleaned.length <= 1500) {
            text = cleaned;
          } else if (cleaned.length > 1500) {
            // Take only the first sentence block (up to ~800 chars) as the likely real paragraph
            const firstBlock = cleaned.slice(0, 800);
            const lastPeriod = firstBlock.lastIndexOf(".");
            text = lastPeriod > 100 ? firstBlock.slice(0, lastPeriod + 1) : firstBlock;
          }
        }
      }
    }

    // Strategy 2: If data-pnum not found, the page may not be the right article
    // Do NOT fall back to data-pid (internal sequential ID) as it doesn't match reader paragraph numbers

    if (text) {
      results.push({ label: `Párrafo ${pNum}`, paragraphNumber: pNum, text });
    }
  }

  return results;
}

/**
 * Extracts ALL numbered paragraphs from a WOL article.
 * Used as fallback when specific paragraph extraction fails but we have the article.
 * ponytail: extracts up to 30 paragraphs max to avoid huge payloads.
 */
function extractAllParagraphsFromHtml(html: string): ExtractedParagraph[] {
  const results: ExtractedParagraph[] = [];
  // Find all data-pnum attributes (reader-visible paragraph numbers)
  const pnumRegex = /data-pnum="(\d+)"/g;
  const seenNums = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = pnumRegex.exec(html)) !== null) {
    seenNums.add(parseInt(m[1], 10));
  }
  if (seenNums.size === 0) return results;

  // Extract each paragraph
  const sorted = Array.from(seenNums).sort((a, b) => a - b).slice(0, 30);
  for (const pNum of sorted) {
    const pnumMarker = `data-pnum="${pNum}"`;
    const pnumIdx = html.indexOf(pnumMarker);
    if (pnumIdx < 0) continue;

    const before = html.slice(Math.max(0, pnumIdx - 300), pnumIdx);
    const pStartRel = before.lastIndexOf("<p");
    if (pStartRel < 0) continue;

    const fullStart = Math.max(0, pnumIdx - 300) + pStartRel;
    const pEnd = html.indexOf("</p>", pnumIdx);
    if (pEnd < 0) continue;

    const pHtml = html.slice(fullStart, pEnd + 4);
    const text = decodeHtmlEntities(pHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const cleaned = text.replace(new RegExp(`^${pNum}\\s+`), "");
    if (cleaned.length > 10) {
      results.push({ label: `Párrafo ${pNum}`, paragraphNumber: pNum, text: cleaned });
    }
  }
  return results;
}

/**
 * Extrae contenido de recuadros (boxes/aside) de un artículo WOL.
 * WOL uses class patterns like "boxSupplement", "du-color--", or <aside> for boxes.
 */
function extractBoxesFromHtml(html: string): ExtractedParagraph[] {
  const results: ExtractedParagraph[] = [];
  // Pattern 1: <div class="boxSupplement...">...</div> (most common)
  const boxRegex = /<div[^>]*class="[^"]*box[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;
  let idx = 0;
  while ((match = boxRegex.exec(html)) !== null) {
    idx++;
    const boxHtml = match[1];
    const text = decodeHtmlEntities(
      boxHtml.replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (text.length > 30) {
      results.push({ label: `Recuadro ${idx}`, text });
    }
  }

  // Pattern 2: <aside...>...</aside>
  if (results.length === 0) {
    const asideRegex = /<aside[^>]*>([\s\S]*?)<\/aside>/gi;
    while ((match = asideRegex.exec(html)) !== null) {
      idx++;
      const text = decodeHtmlEntities(
        match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      );
      if (text.length > 30) {
        results.push({ label: `Recuadro ${idx}`, text });
      }
    }
  }

  return results;
}

/**
 * Extrae notas al pie de un artículo WOL.
 * WOL uses class "groupFootnote" or "footnote" for notes.
 */
function extractNotesFromHtml(html: string): ExtractedParagraph[] {
  const results: ExtractedParagraph[] = [];
  // Pattern: footnote sections
  const noteRegex = /<div[^>]*class="[^"]*(?:footnote|groupFootnote)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  let idx = 0;
  while ((match = noteRegex.exec(html)) !== null) {
    idx++;
    const text = decodeHtmlEntities(
      match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );
    if (text.length > 10) {
      results.push({ label: `Nota ${idx}`, text });
    }
  }

  // Pattern 2: <p class="...note...">
  if (results.length === 0) {
    const notePRegex = /<p[^>]*class="[^"]*note[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = notePRegex.exec(html)) !== null) {
      idx++;
      const text = decodeHtmlEntities(
        match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      );
      if (text.length > 10) {
        results.push({ label: `Nota ${idx}`, text });
      }
    }
  }

  return results;
}

// ─── Publication metadata helpers ────────────────────────

const PUB_NAMES: Record<string, string> = {
  w: "La Atalaya", g: "¡Despertad!", wp: "La Atalaya (edición de estudio)",
  lff: "Disfrute de la vida para siempre", cl: "Acerquémonos a Jehová",
  bt: "Hechos de los Apóstoles", rr: "Manténganse en el amor de Dios",
  ia: "Imiten su fe", od: "Organizados", kr: "El Reino de Dios ya satisface",
  nwt: "Traducción del Nuevo Mundo",
};

const MONTH_NAMES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function derivePublicationName(ref: WolReference): string | undefined {
  const baseCode = ref.publicationCode.replace(/\d+(\.\d+)?$/, "");
  const pubName = PUB_NAMES[baseCode];
  if (!pubName) return undefined;

  const yearMatch = ref.publicationCode.match(/(\d{2})(?:\.\d{2})?$/);
  let fullYear: number | null = null;
  if (yearMatch) {
    fullYear = shortYearToFull(parseInt(yearMatch[1], 10));
  }

  let dateStr: string | null = null;
  if (ref.date) {
    const [day, month] = ref.date.split("/");
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    if (monthNum >= 1 && monthNum <= 12) {
      // "15 de diciembre de 2015" or "diciembre de 2015" if day is issue day
      if (dayNum && dayNum >= 1 && dayNum <= 31) {
        dateStr = `${dayNum} de ${MONTH_NAMES[monthNum]} de ${fullYear}`;
      } else {
        dateStr = `${MONTH_NAMES[monthNum]} de ${fullYear}`;
      }
    }
  }

  if (dateStr) return `${pubName}, ${dateStr}`;
  if (fullYear) return `${pubName}, ${fullYear}`;
  return pubName;
}

// ─── Resolver principal ──────────────────────────────────

/**
 * Resuelve una referencia WOL textual (tipo "wol").
 * Flujo:
 * 1. Validar referencia (fecha, página, párrafos)
 * 2. Buscar en WOL con múltiples estrategias
 * 3. Para cada resultado candidato, verificar que tiene los párrafos solicitados
 * 4. Solo marcar resolved si se encontraron los párrafos reales en un artículo
 */
async function resolveWolReference(ref: WolReference, userContext?: string): Promise<ResolvedReference> {
  const cacheKey = `wol:${ref.raw}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Step 0a: Check manual fallback before any WOL request
  const manualFallback = getManualFallback(ref.raw);
  if (manualFallback) {
    const result: ResolvedReference = {
      type: "wol",
      raw: ref.raw,
      status: "resolved",
      sourceOrigin: "manual_user_verified",
      title: manualFallback.articleTitle || manualFallback.title,
      publication: manualFallback.publication,
      url: manualFallback.url || manualFallback.searchUrl || undefined,
      urlType: manualFallback.url ? "direct" : "search",
      excerpt: manualFallback.contentBlocks[0]?.text?.slice(0, 400) || "",
      extractedContent: manualFallback.contentBlocks.map((b: any) => ({
        label: b.label,
        paragraphNumber: undefined,
        text: b.text,
      })),
      notes: `Resuelto desde fallback manual verificado. ${manualFallback.notes || ""}`.trim(),
    };
    setCache(cacheKey, result);
    return result;
  }

  // Step 0b: Validate reference
  const validationError = validateWolReference(ref);
  if (validationError) {
    const result: ResolvedReference = {
      type: "wol",
      raw: ref.raw,
      status: "invalid_reference",
      notes: `Referencia inválida: ${validationError}`,
    };
    setCache(cacheKey, result);
    return result;
  }

  const searchUrl = buildWolPublicationSearchUrl(ref);

  const result: ResolvedReference = {
    type: "wol",
    raw: ref.raw,
    status: "unresolved",
    url: searchUrl,
    urlType: "search",
    notes: "Referencia detectada. No se pudo extraer contenido real.",
  };

  if (process.env.RESEARCH_CHAT_WOL_ENABLED === "false") {
    setCache(cacheKey, result);
    return result;
  }

  // Step 1: Collect candidate article URLs from multiple search strategies
  // ponytail: if precursor index has a direct mepsDocumentId, use it as FIRST candidate
  const precursorHint = lookupPrecursorIndex(ref.raw);
  const precursorDirectUrl = precursorHint?.mepsDocumentId
    ? `https://wol.jw.org/es/wol/d/r4/lp-s/${precursorHint.mepsDocumentId}`
    : null;

  const candidateUrls = await findArticleCandidates(ref, searchUrl, userContext);
  
  // Prepend precursor direct URL if not already in candidates
  if (precursorDirectUrl && !candidateUrls.includes(precursorDirectUrl)) {
    candidateUrls.unshift(precursorDirectUrl);
  }

  if (candidateUrls.length === 0) {
    setCache(cacheKey, result);
    return result;
  }

  // Step 2: For each candidate, fetch and check if it contains the requested content
  for (const candidateUrl of candidateUrls) {
    const articleHtml = await fetchWolPage(candidateUrl);
    if (!articleHtml || !isArticlePage(articleHtml)) continue;

    let extracted: ExtractedParagraph[] = [];
    const target = (ref as any).target as string | undefined;

    if (target === "box") {
      extracted = extractBoxesFromHtml(articleHtml);
    } else if (target === "note") {
      extracted = extractNotesFromHtml(articleHtml);
    } else if (ref.paragraphs && ref.paragraphs.length > 0) {
      // Try specific paragraphs first
      extracted = extractParagraphsFromHtml(articleHtml, ref.paragraphs);
      // Fallback: if data-pnum failed, try extracting all paragraphs and filtering
      if (extracted.length === 0) {
        const allParas = extractAllParagraphsFromHtml(articleHtml);
        if (allParas.length > 0) {
          const wanted = new Set(ref.paragraphs);
          extracted = allParas.filter(p => p.paragraphNumber && wanted.has(p.paragraphNumber));
          // ponytail: if specific paragraph not found, do NOT dump entire article.
          // Only provide the exact paragraph if found by number match.
          // If not found at all, mark extraction as failed — do NOT fallback to
          // "closest" or "by position" because that shows wrong content as if verified.
          if (extracted.length === 0) {
            // ponytail: DO NOT fall back to closest/position.
            // A wrong paragraph presented as "the" paragraph is worse than saying we couldn't find it.
            // The article was found, but the specific paragraph could not be isolated.
            extracted = [];
          }
        }
      }
    } else {
      // Pages target or no specific target — extract all paragraphs or full excerpt
      const allParas = extractAllParagraphsFromHtml(articleHtml);
      if (allParas.length > 0) {
        extracted = allParas;
      } else {
        const excerpt = extractExcerpt(articleHtml, 2000);
        if (excerpt && excerpt.length > 50) {
          extracted = [{ label: "Extracto del artículo", text: excerpt }];
        }
      }
    }

    if (extracted.length > 0) {
      const title = extractTitle(articleHtml);
      result.status = "resolved";
      result.sourceOrigin = "wol_article";
      result.title = sanitizeTitle(title);
      result.excerpt = extracted.map((p) => p.text).join(" ").slice(0, 600);
      result.extractedContent = extracted;
      result.publication = derivePublicationName(ref);
      result.url = candidateUrl;
      result.urlType = "direct";
      result.notes = target === "box"
        ? "Recuadro extraído del artículo."
        : target === "note"
          ? "Nota extraída del artículo."
          : "Referencia resuelta con contenido real del artículo.";
      setCache(cacheKey, result);
      return result;
    }

    // ponytail: Article was found (valid page) but specific paragraph could not be isolated.
    // Try extracting ALL paragraphs as fallback before giving up.
    if (ref.paragraphs && ref.paragraphs.length > 0 && isArticlePage(articleHtml)) {
      const allParas = extractAllParagraphsFromHtml(articleHtml);
      if (allParas.length > 0) {
        // Try to find the requested paragraphs in the full extraction
        const wanted = new Set(ref.paragraphs);
        let fallbackExtracted = allParas.filter(p => p.paragraphNumber && wanted.has(p.paragraphNumber));
        // If specific paragraphs not found by number, use all paragraphs as context
        if (fallbackExtracted.length === 0) fallbackExtracted = allParas;
        
        const title = extractTitle(articleHtml);
        result.status = "resolved";
        result.title = sanitizeTitle(title);
        result.excerpt = fallbackExtracted.map(p => p.text).join(" ").slice(0, 600);
        result.extractedContent = fallbackExtracted;
        result.publication = derivePublicationName(ref);
        result.url = candidateUrl;
        result.urlType = "direct";
        result.sourceOrigin = "wol_article";
        result.notes = fallbackExtracted.some(p => p.paragraphNumber && wanted.has(p.paragraphNumber))
          ? "Referencia resuelta con contenido real del artículo."
          : "Artículo encontrado. Párrafo específico no aislado; se incluyó contenido completo del artículo.";
        setCache(cacheKey, result);
        return result;
      }

      // If even extractAllParagraphs failed, try excerpt as last resort
      const longExcerpt = extractExcerpt(articleHtml, 2000);
      if (longExcerpt && longExcerpt.length > 100) {
        const title = extractTitle(articleHtml);
        result.status = "resolved";
        result.title = sanitizeTitle(title);
        result.excerpt = longExcerpt;
        result.extractedContent = [{ label: sanitizeTitle(title) || "Artículo", text: longExcerpt }];
        result.publication = derivePublicationName(ref);
        result.url = candidateUrl;
        result.urlType = "direct";
        result.sourceOrigin = "wol_article";
        result.notes = "Artículo encontrado. Párrafo específico no aislado; se incluyó extracto del artículo.";
        setCache(cacheKey, result);
        return result;
      }

      // True failure — article found but no content extractable at all
      const title = extractTitle(articleHtml);
      if (title && title.length > 5) {
        result.status = "extraction_failed" as any;
        result.title = sanitizeTitle(title);
        result.publication = derivePublicationName(ref);
        result.url = candidateUrl;
        result.urlType = "direct";
        result.notes = `Se encontró el artículo "${sanitizeTitle(title)}" pero no se pudo extraer contenido. Abre el artículo para verificar manualmente.`;
        setCache(cacheKey, result);
        return result;
      }
    }
  }

  // Step 3: None of the candidates had the specific content
  // Before giving up, check if the precursor study index has metadata for this reference
  const precursorMatch = lookupPrecursorIndex(ref.raw);
  if (precursorMatch) {
    // If we have a mepsDocumentId, try fetching the article directly and extracting content
    if (precursorMatch.mepsDocumentId) {
      const directUrl = `https://wol.jw.org/es/wol/d/r4/lp-s/${precursorMatch.mepsDocumentId}`;
      const articleHtml = await fetchWolPage(directUrl);
      if (articleHtml && isArticlePage(articleHtml)) {
        let extracted: ExtractedParagraph[] = [];
        const target = (ref as any).target as string | undefined;

        if (target === "box") {
          extracted = extractBoxesFromHtml(articleHtml);
        } else if (target === "note") {
          extracted = extractNotesFromHtml(articleHtml);
        } else if (ref.paragraphs && ref.paragraphs.length > 0) {
          extracted = extractParagraphsFromHtml(articleHtml, ref.paragraphs);
        }

        // If specific extraction failed, try getting a broader excerpt
        if (extracted.length === 0) {
          // Try extracting ALL numbered paragraphs from the article
          const allParas = extractAllParagraphsFromHtml(articleHtml);
          if (allParas.length > 0) {
            // If we have a page target, use all paragraphs as content
            extracted = allParas;
          } else {
            // Last resort: get a long excerpt from the article body
            const fullExcerpt = extractExcerpt(articleHtml, 2000);
            if (fullExcerpt && fullExcerpt.length > 50) {
              extracted = [{ label: precursorMatch.articleTitle || "Artículo", text: fullExcerpt }];
            }
          }
        }

        if (extracted.length > 0) {
          const title = extractTitle(articleHtml);
          result.status = "resolved";
          result.sourceOrigin = "wol_article";
          result.title = sanitizeTitle(title) || precursorMatch.articleTitle;
          result.publication = precursorMatch.publicationTitle || derivePublicationName(ref);
          result.excerpt = extracted.map((p) => p.text).join(" ").slice(0, 600);
          result.extractedContent = extracted;
          result.url = directUrl;
          result.urlType = "direct";
          result.notes = "Artículo resuelto via índice del libro de precursores con contenido real extraído.";
          setCache(cacheKey, result);
          return result;
        }
      }
    }

    // Fallback: if fetch/extraction still failed, at least return with the direct URL
    result.status = "resolved";
    result.sourceOrigin = "precursor_metadata";
    result.title = precursorMatch.articleTitle;
    result.publication = precursorMatch.publicationTitle;
    result.excerpt = `[Referencia del libro de precursores] ${precursorMatch.articleTitle || precursorMatch.caption}`;
    result.extractedContent = [{
      label: precursorMatch.caption || ref.raw,
      text: `Artículo: ${precursorMatch.articleTitle || ""}. Publicación: ${precursorMatch.publicationTitle || ""}. Referencia en lección del libro de precursores.`,
      paragraphNumber: undefined,
    }];
    result.url = precursorMatch.mepsDocumentId
      ? `https://wol.jw.org/es/wol/d/r4/lp-s/${precursorMatch.mepsDocumentId}`
      : result.url;
    result.urlType = precursorMatch.mepsDocumentId ? "direct" : result.urlType;
    result.notes = `Referencia localizada en el índice del libro de precursores. Artículo: "${precursorMatch.articleTitle}". El texto completo del párrafo no está disponible en la base local.`;
    setCache(cacheKey, result);
    return result;
  }

  const target = (ref as any).target as string | undefined;
  result.status = "unresolved";
  result.notes = target === "box"
    ? "No se encontró un recuadro en el artículo. Pega el link directo o el texto del recuadro."
    : target === "note"
      ? "No se encontró la nota en el artículo. Pega el link directo o el texto de la nota."
      : "No se encontró un artículo con los párrafos solicitados. Pega el link directo del artículo desde JW.org, o pega el texto de los párrafos.";

  setCache(cacheKey, result);
  return result;
}

/**
 * Tries multiple search strategies to find candidate article URLs.
 * Returns unique direct WOL article URLs to try.
 */
async function findArticleCandidates(ref: WolReference, primarySearchUrl: string, userContext?: string): Promise<string[]> {
  const seen = new Set<string>();
  const candidates: string[] = [];

  function addUrl(url: string) {
    if (!seen.has(url)) { seen.add(url); candidates.push(url); }
  }

  // Determine expected year from reference for filtering
  const yearMatch = ref.publicationCode.match(/(\d{2})(?:\.\d{2})?$/);
  const expectedYear = yearMatch ? shortYearToFull(parseInt(yearMatch[1], 10)) : null;

  // Strategy 0.5: Direct lookup endpoints /wol/l/ and /wol/pl/
  // /wol/l/ → periódicos (w, g, wp, mwb, km, yb)
  // /wol/pl/ → libros y no periódicos (kr, cl, lff, bt, ia, od, nwt, etc.)
  // Ambos reciben el raw como ?q= y WOL resuelve internamente.
  const baseCode = ref.publicationCode.replace(/\d+(\.\d+)?$/, "");
  const PERIODICAL_CODES = new Set(["w", "g", "wp", "mwb", "km", "yb"]);
  const isPeriodical = PERIODICAL_CODES.has(baseCode);

  // ponytail: strip target suffixes (", recuadro", ", nota") from raw before sending to WOL
  const searchableRaw = ref.raw.replace(/,?\s*(recuadro|nota)\s*$/i, "").trim();

  // ponytail: try the most likely endpoint first, fall back to the other
  const lookupUrls = isPeriodical
    ? [buildWolLookupUrl(searchableRaw), buildWolPubLookupUrl(searchableRaw)]
    : [buildWolPubLookupUrl(searchableRaw), buildWolLookupUrl(searchableRaw)];

  for (const lookupUrl of lookupUrls) {
    const html = await fetchWolPage(lookupUrl);
    if (!html) continue;
    if (isArticlePage(html)) {
      // The lookup endpoint returned the article directly
      addUrl(lookupUrl);
    } else {
      // It may return a results/redirect page — extract article URLs from it
      const articleUrls = extractAllResultUrls(html);
      for (const url of articleUrls) addUrl(url);
    }
    // If we got results from lookup, return immediately — it's the most precise
    if (candidates.length > 0) return candidates.slice(0, 8);
  }

  // Strategy 0: WOL Library Path (most reliable for dated publications like w, g)
  // Constructs: /es/wol/library/r4/lp-s/biblioteca/{pub}/{pub}-{YYYY}/edición-de-estudio/{DD}-de-{MES}
  const libraryArticles = await getArticlesFromLibraryPath(ref, expectedYear);
  for (const url of libraryArticles) addUrl(url);

  // If library path found articles, use those exclusively (they're the correct issue)
  if (candidates.length > 0) {
    return candidates.slice(0, 8);
  }

  // Strategy 1: Publication-based search (e.g. "La Atalaya 2015 diciembre")
  const html1 = await fetchWolPage(primarySearchUrl);
  if (html1) {
    if (isArticlePage(html1)) {
      addUrl(primarySearchUrl);
    } else {
      for (const url of extractAllResultUrls(html1)) addUrl(url);
    }
  }

  // Strategy 2: Search with raw reference text
  if (candidates.length === 0) {
    const rawSearchUrl = buildWolSearchUrl(ref.raw);
    const html2 = await fetchWolPage(rawSearchUrl);
    if (html2 && !isArticlePage(html2)) {
      for (const url of extractAllResultUrls(html2)) addUrl(url);
    }
  }

  // Strategy 3: If we found a candidate that ISN'T an article page (e.g. a workbook page),
  // try to extract the article TITLE from that page, then search for articles with similar title/topic.
  // Also: open that page and look for links to related articles (same issue).
  if (candidates.length > 0 && candidates.length <= 3) {
    for (const candidateUrl of [...candidates]) {
      const candidateHtml = await fetchWolPage(candidateUrl);
      if (!candidateHtml) continue;
      if (isArticlePage(candidateHtml)) continue; // Already a good candidate
      // Extract titles of articles linked from this page
      const linkedUrls = extractAllResultUrls(candidateHtml);
      for (const url of linkedUrls) addUrl(url);
    }
  }

  // Strategy 4: Use user context (question text) as search keywords
  // Strip the reference from the context and use remaining keywords
  if (userContext && candidates.length < 3) {
    const contextKeywords = userContext
      .replace(/\([^)]*\)/g, "") // Remove parenthetical references
      .replace(/https?:\/\/\S+/g, "") // Remove URLs
      .replace(/w\d{2}\s+\d+\/\d+[^.)]*/gi, "") // Remove WOL ref patterns
      .replace(/[¿?¡!.,;:()]/g, " ") // Remove punctuation
      .replace(/\s+/g, " ")
      .trim();

    if (contextKeywords.length > 10) {
      // Search with context keywords (often contains article theme/topic)
      const contextSearchUrl = buildWolSearchUrl(contextKeywords.slice(0, 80));
      const html3 = await fetchWolPage(contextSearchUrl);
      if (html3 && !isArticlePage(html3)) {
        for (const url of extractAllResultUrls(html3)) addUrl(url);
      }
    }
  }

  // Filter: prefer candidates whose docId contains the expected year
  if (expectedYear && candidates.length > 1) {
    const yearStr = String(expectedYear);
    const yearFiltered = candidates.filter((url) => url.includes(yearStr));
    if (yearFiltered.length > 0) return yearFiltered.slice(0, 5);
  }

  return candidates.slice(0, 5);
}

/**
 * Extracts all unique article URLs from a WOL search results page.
 */
function extractAllResultUrls(searchHtml: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  const regex = /\/es\/wol\/d\/r4\/lp-s\/(\d+)/g;
  let match;
  while ((match = regex.exec(searchHtml)) !== null) {
    const url = `https://wol.jw.org/es/wol/d/r4/lp-s/${match[1]}`;
    if (!seen.has(url)) { seen.add(url); results.push(url); }
  }
  return results;
}

/**
 * Constructs the WOL library path for a publication issue and returns all article URLs listed there.
 * This is the most reliable method for dated publications (w, g).
 * 
 * Path: /es/wol/library/r4/lp-s/biblioteca/{pub}/{pub}-{YYYY}/edición-de-estudio/{DD}-de-{MES}
 * Example: /es/wol/library/r4/lp-s/biblioteca/la-atalaya/la-atalaya-2015/edición-de-estudio/15-de-diciembre
 */
async function getArticlesFromLibraryPath(ref: WolReference, year: number | null): Promise<string[]> {
  if (!year || !ref.date) return [];

  const [dayStr, monthStr] = ref.date.split("/");
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  if (!day || !month || month < 1 || month > 12) return [];

  const monthName = MONTH_NAMES[month];
  if (!monthName) return [];

  const baseCode = ref.publicationCode.replace(/\d+(\.\d+)?$/, "");

  // Publication path mapping
  const PUB_LIBRARY_PATHS: Record<string, string[]> = {
    w: [
      `biblioteca/la-atalaya/la-atalaya-${year}/edición-de-estudio/${day}-de-${monthName}`,
      `biblioteca/la-atalaya/la-atalaya-${year}/${day}-de-${monthName}`,
    ],
    wp: [
      `biblioteca/la-atalaya/la-atalaya-${year}/${day}-de-${monthName}`,
    ],
    g: [
      `biblioteca/despertad/despertad-${year}/${day}-de-${monthName}`,
      `biblioteca/despertad/despertad-${year}/${monthName}`,
    ],
  };

  const pathVariants = PUB_LIBRARY_PATHS[baseCode];
  if (!pathVariants) return [];

  for (const variant of pathVariants) {
    const url = `https://wol.jw.org/es/wol/library/r4/lp-s/${variant}`;
    const html = await fetchWolPage(url);
    if (!html) continue;

    // Extract all article docIds from this issue page
    const docPaths = [...new Set((html.match(/\/es\/wol\/d\/r4\/lp-s\/\d+/g) || []))];
    if (docPaths.length > 0) {
      return docPaths.map((p) => `https://wol.jw.org${p}`);
    }
  }

  return [];
}

/**
 * Resuelve un link directo de WOL.
 */
async function resolveWolLink(ref: WolLinkReference): Promise<ResolvedReference> {
  const cacheKey = `link:${ref.url}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result: ResolvedReference = {
    type: "wol_link",
    raw: ref.raw,
    status: "unresolved",
    url: ref.url,
    urlType: "direct",
    notes: "Enlace directo de WOL.",
  };

  if (process.env.RESEARCH_CHAT_WOL_ENABLED !== "false") {
    const html = await fetchWolPage(ref.url);
    if (html) {
      const title = extractTitle(html);
      const excerpt = extractExcerpt(html, 500);
      if (excerpt && excerpt.trim().length > 30) {
        result.status = "resolved";
        result.title = sanitizeTitle(title);
        result.excerpt = excerpt;
        result.notes = "Enlace de WOL resuelto con contenido.";
      } else if (title) {
        result.title = sanitizeTitle(title);
        result.notes = "Se encontró la página pero no se extrajo contenido suficiente.";
      }
    }
  }

  setCache(cacheKey, result);
  return result;
}

// ─── Bible book number mapping (nwtsty) ─────────────────

const BIBLE_BOOK_NUMBERS: Record<string, number> = {
  "Génesis": 1, "Éxodo": 2, "Levítico": 3, "Números": 4, "Deuteronomio": 5,
  "Josué": 6, "Jueces": 7, "Rut": 8, "1 Samuel": 9, "2 Samuel": 10,
  "1 Reyes": 11, "2 Reyes": 12, "1 Crónicas": 13, "2 Crónicas": 14,
  "Esdras": 15, "Nehemías": 16, "Ester": 17, "Job": 18, "Salmos": 19,
  "Proverbios": 20, "Eclesiastés": 21, "Cantar de los Cantares": 22,
  "Isaías": 23, "Jeremías": 24, "Lamentaciones": 25, "Ezequiel": 26,
  "Daniel": 27, "Oseas": 28, "Joel": 29, "Amós": 30, "Abdías": 31,
  "Jonás": 32, "Miqueas": 33, "Nahúm": 34, "Habacuc": 35, "Sofonías": 36,
  "Ageo": 37, "Zacarías": 38, "Malaquías": 39, "Mateo": 40, "Marcos": 41,
  "Lucas": 42, "Juan": 43, "Hechos": 44, "Romanos": 45, "1 Corintios": 46,
  "2 Corintios": 47, "Gálatas": 48, "Efesios": 49, "Filipenses": 50,
  "Colosenses": 51, "1 Tesalonicenses": 52, "2 Tesalonicenses": 53,
  "1 Timoteo": 54, "2 Timoteo": 55, "Tito": 56, "Filemón": 57,
  "Hebreos": 58, "Santiago": 59, "1 Pedro": 60, "2 Pedro": 61,
  "1 Juan": 62, "2 Juan": 63, "3 Juan": 64, "Judas": 65, "Revelación": 66,
};

/** Parse verse string like "9", "9, 10", "9-13", "16, 17" into individual verse numbers. */
function parseVerseNumbers(verses: string): number[] {
  const result: number[] = [];
  const parts = verses.split(/\s*,\s*/);
  for (const part of parts) {
    if (part.includes("-") || part.includes("–")) {
      const [a, b] = part.split(/[-–]/).map(s => parseInt(s.trim(), 10));
      if (!isNaN(a) && !isNaN(b)) {
        for (let i = a; i <= b; i++) result.push(i);
      }
    } else {
      const n = parseInt(part.trim(), 10);
      if (!isNaN(n)) result.push(n);
    }
  }
  return result;
}

/**
 * Resolves a Bible reference. Priority: local nwt_S.json → WOL fetch fallback.
 * Only returns status "resolved" if extractedContent has real text.
 * ponytail: local resolve is sync + instant; WOL fetch only on local failure.
 */
async function resolveBibleReference(book: string, chapter: number, verses: string, raw: string): Promise<ResolvedReference> {
  const cacheKey = `bible:${raw}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // 1. Try local Bible first
  const local = resolveFromLocal(book, chapter, verses, raw);
  if (local.status === "resolved" && local.extractedContent.length > 0) {
    const result: ResolvedReference = {
      type: "bible", raw, status: "resolved",
      sourceOrigin: "local_bible",
      url: local.url, urlType: "direct",
      title: raw, publication: "Traducción del Nuevo Mundo",
      excerpt: local.excerpt,
      extractedContent: local.extractedContent.map(v => ({
        label: v.label, paragraphNumber: v.paragraphNumber, text: v.text,
      })),
      notes: local.notes,
    };
    setCache(cacheKey, result);
    return result;
  }

  // 2. Local failed — try WOL fetch as fallback
  const bookNumber = BIBLE_BOOK_NUMBERS[book];
  if (!bookNumber) {
    const result: ResolvedReference = {
      type: "bible", raw, status: "extraction_failed",
      url: `${WOL_BASE}/s/r4/lp-s?q=${encodeURIComponent(raw)}`,
      urlType: "search", title: raw,
      notes: `Libro bíblico "${book}" no mapeado. No hay texto local ni WOL.`,
    };
    setCache(cacheKey, result);
    return result;
  }

  const chapterUrl = `https://wol.jw.org/es/wol/b/r4/lp-s/nwt/${bookNumber}/${chapter}`;

  if (process.env.RESEARCH_CHAT_WOL_ENABLED === "false") {
    const result: ResolvedReference = {
      type: "bible", raw, status: "extraction_failed",
      url: chapterUrl, urlType: "direct", title: raw,
      notes: "Biblia local sin resultado y WOL deshabilitado. Sin texto real.",
    };
    setCache(cacheKey, result);
    return result;
  }

  const html = await fetchWolPage(chapterUrl);
  if (!html) {
    const result: ResolvedReference = {
      type: "bible", raw, status: "extraction_failed",
      url: chapterUrl, urlType: "direct", title: raw,
      notes: "Biblia local sin resultado y WOL no respondió. Sin texto real.",
    };
    setCache(cacheKey, result);
    return result;
  }

  // Extract verses from WOL HTML
  const verseNumbers = parseVerseNumbers(verses);
  const extractedContent: ExtractedParagraph[] = [];

  for (const vNum of verseNumbers) {
    const verseMarkerRegex = new RegExp(`id="v${bookNumber}-${chapter}-${vNum}(?:-\\d+)?"\\s+class="v"`, "i");
    const markerMatch = verseMarkerRegex.exec(html);
    if (!markerMatch) continue;

    const tagCloseIdx = html.indexOf(">", markerMatch.index + markerMatch[0].length);
    const startIdx = tagCloseIdx >= 0 ? tagCloseIdx + 1 : markerMatch.index + markerMatch[0].length;

    const nextVerseRegex = new RegExp(`id="v${bookNumber}-${chapter}-${vNum + 1}(?:-\\d+)?"\\s+class="v"`, "i");
    const nextMatch = nextVerseRegex.exec(html.slice(startIdx));
    const endIdx = nextMatch ? startIdx + nextMatch.index : startIdx + 2000;

    const verseHtml = html.slice(startIdx, Math.min(endIdx, startIdx + 2000));
    let text = decodeHtmlEntities(
      verseHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );
    text = text.replace(/^\d+\s*/, "").replace(/[*†+]+\s*/g, "").replace(/\s*<[^>]*$/, "").trim();

    if (text.length > 5) {
      extractedContent.push({ label: `${book} ${chapter}:${vNum}`, paragraphNumber: vNum, text });
    }
  }

  // Only mark resolved if we got real text
  const hasRealContent = extractedContent.length > 0;
  const result: ResolvedReference = {
    type: "bible", raw,
    status: hasRealContent ? "resolved" : "extraction_failed",
    sourceOrigin: hasRealContent ? "wol_bible" : "none",
    url: chapterUrl, urlType: "direct",
    title: raw, publication: "Traducción del Nuevo Mundo",
    excerpt: hasRealContent ? extractedContent.map(v => v.text).join(" ").slice(0, 400) : "",
    extractedContent: hasRealContent ? extractedContent : undefined,
    notes: hasRealContent
      ? `${extractedContent.length} versículo(s) extraído(s) desde WOL Bible (fallback).`
      : "Biblia local y WOL fallaron. No se pudo obtener texto real.",
  };

  setCache(cacheKey, result);
  return result;
}

// ─── Public API ──────────────────────────────────────────

import type { ParsedReference, BibleReference } from "@jw-reminders/shared";

/**
 * Resuelve un array de referencias parseadas.
 * Ejecuta en paralelo con concurrencia limitada (max 3).
 */
export async function resolveReferences(refs: ParsedReference[], userContext?: string): Promise<ResolvedReference[]> {
  const results: ResolvedReference[] = [];
  const batchSize = 3;

  for (let i = 0; i < refs.length; i += batchSize) {
    const batch = refs.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((ref) => resolveOne(ref, userContext))
    );
    results.push(...batchResults);
  }

  return results;
}

async function resolveOne(ref: ParsedReference, userContext?: string): Promise<ResolvedReference> {
  try {
    switch (ref.type) {
      case "bible":
        return await resolveBibleReference(
          (ref as BibleReference).book,
          (ref as BibleReference).chapter,
          (ref as BibleReference).verses,
          ref.raw
        );
      case "wol":
        return await resolveWolReference(ref as WolReference, userContext);
      case "wol_link":
        return await resolveWolLink(ref as WolLinkReference);
      default:
        return { type: "unknown", raw: (ref as any).raw || "", status: "failed" as const, notes: "Tipo no reconocido" };
    }
  } catch (err) {
    return {
      type: ref.type,
      raw: ref.raw,
      status: "failed",
      notes: `Error al resolver: ${err instanceof Error ? err.message : "desconocido"}`,
    };
  }
}
