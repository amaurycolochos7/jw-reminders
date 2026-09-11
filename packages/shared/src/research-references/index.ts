/**
 * Parser de referencias bíblicas y WOL para Research Chat.
 *
 * Detecta y normaliza referencias dentro de texto libre:
 * - Citas bíblicas: "Mateo 22:37", "1 Corintios 13:4-7", "Prov. 23:23"
 * - Referencias WOL: "w15 15/12 pág. 8 párrs. 16, 17"
 * - Links directos de WOL: "https://wol.jw.org/es/wol/d/r4/lp-s/..."
 */

// ─── Types ───────────────────────────────────────────────

export interface BibleReference {
  type: "bible";
  book: string;
  chapter: number;
  verses: string;
  raw: string;
}

export interface WolReference {
  type: "wol";
  publicationCode: string;
  date?: string;
  chapter?: number;
  page?: number;
  endPage?: number;
  paragraphs?: number[];
  lesson?: string;
  point?: string;
  issue?: string;
  target?: "paragraphs" | "pages" | "box" | "note";
  raw: string;
  language: string;
}

export interface WolLinkReference {
  type: "wol_link";
  url: string;
  raw: string;
  language: string;
}

export type ParsedReference = BibleReference | WolReference | WolLinkReference;

// ─── Bible Books ─────────────────────────────────────────

/** Mapeo de abreviaturas → nombre completo del libro bíblico. */
const BIBLE_BOOKS: Record<string, string> = {
  // Hebreo
  "gén": "Génesis", "génesis": "Génesis", "gen": "Génesis",
  "éx": "Éxodo", "éxodo": "Éxodo", "ex": "Éxodo", "exodo": "Éxodo",
  "lev": "Levítico", "levítico": "Levítico", "levitico": "Levítico",
  "núm": "Números", "números": "Números", "num": "Números", "numeros": "Números",
  "deut": "Deuteronomio", "deuteronomio": "Deuteronomio", "dt": "Deuteronomio",
  "jos": "Josué", "josué": "Josué", "josue": "Josué",
  "jue": "Jueces", "jueces": "Jueces",
  "rut": "Rut",
  "1 sam": "1 Samuel", "1 samuel": "1 Samuel", "1sam": "1 Samuel",
  "2 sam": "2 Samuel", "2 samuel": "2 Samuel", "2sam": "2 Samuel",
  "1 rey": "1 Reyes", "1 reyes": "1 Reyes", "1rey": "1 Reyes",
  "2 rey": "2 Reyes", "2 reyes": "2 Reyes", "2rey": "2 Reyes",
  "1 cró": "1 Crónicas", "1 crónicas": "1 Crónicas", "1 cronicas": "1 Crónicas", "1cro": "1 Crónicas",
  "2 cró": "2 Crónicas", "2 crónicas": "2 Crónicas", "2 cronicas": "2 Crónicas", "2cro": "2 Crónicas",
  "esd": "Esdras", "esdras": "Esdras",
  "neh": "Nehemías", "nehemías": "Nehemías", "nehemias": "Nehemías",
  "est": "Ester", "ester": "Ester",
  "job": "Job",
  "sal": "Salmos", "salmos": "Salmos", "salmo": "Salmos",
  "prov": "Proverbios", "proverbios": "Proverbios", "pr": "Proverbios",
  "ecl": "Eclesiastés", "eclesiastés": "Eclesiastés", "eclesiastes": "Eclesiastés",
  "cant": "Cantar de los Cantares", "cantar de los cantares": "Cantar de los Cantares",
  "isa": "Isaías", "isaías": "Isaías", "isaias": "Isaías", "is": "Isaías",
  "jer": "Jeremías", "jeremías": "Jeremías", "jeremias": "Jeremías",
  "lam": "Lamentaciones", "lamentaciones": "Lamentaciones",
  "ezeq": "Ezequiel", "ezequiel": "Ezequiel", "eze": "Ezequiel", "ez": "Ezequiel",
  "dan": "Daniel", "daniel": "Daniel",
  "ose": "Oseas", "oseas": "Oseas", "os": "Oseas",
  "joel": "Joel",
  "amós": "Amós", "amos": "Amós", "am": "Amós",
  "abd": "Abdías", "abdías": "Abdías", "abdias": "Abdías",
  "jon": "Jonás", "jonás": "Jonás", "jonas": "Jonás",
  "miq": "Miqueas", "miqueas": "Miqueas",
  "nah": "Nahúm", "nahúm": "Nahúm", "nahum": "Nahúm",
  "hab": "Habacuc", "habacuc": "Habacuc",
  "sof": "Sofonías", "sofonías": "Sofonías", "sofonias": "Sofonías",
  "hag": "Ageo", "ageo": "Ageo",
  "zac": "Zacarías", "zacarías": "Zacarías", "zacarias": "Zacarías",
  "mal": "Malaquías", "malaquías": "Malaquías", "malaquias": "Malaquías",
  // Griego
  "mat": "Mateo", "mateo": "Mateo", "mt": "Mateo",
  "mar": "Marcos", "marcos": "Marcos", "mc": "Marcos",
  "luc": "Lucas", "lucas": "Lucas", "lc": "Lucas",
  "juan": "Juan", "jn": "Juan",
  "hech": "Hechos", "hechos": "Hechos", "hch": "Hechos",
  "rom": "Romanos", "romanos": "Romanos", "ro": "Romanos",
  "1 cor": "1 Corintios", "1 corintios": "1 Corintios", "1cor": "1 Corintios",
  "2 cor": "2 Corintios", "2 corintios": "2 Corintios", "2cor": "2 Corintios",
  "gál": "Gálatas", "gálatas": "Gálatas", "galatas": "Gálatas", "gal": "Gálatas",
  "efe": "Efesios", "efesios": "Efesios", "ef": "Efesios",
  "fil": "Filipenses", "filipenses": "Filipenses", "flp": "Filipenses",
  "col": "Colosenses", "colosenses": "Colosenses",
  "1 tes": "1 Tesalonicenses", "1 tesalonicenses": "1 Tesalonicenses", "1tes": "1 Tesalonicenses",
  "2 tes": "2 Tesalonicenses", "2 tesalonicenses": "2 Tesalonicenses", "2tes": "2 Tesalonicenses",
  "1 tim": "1 Timoteo", "1 timoteo": "1 Timoteo", "1tim": "1 Timoteo",
  "2 tim": "2 Timoteo", "2 timoteo": "2 Timoteo", "2tim": "2 Timoteo",
  "tito": "Tito", "tit": "Tito",
  "flm": "Filemón", "filemón": "Filemón", "filemon": "Filemón",
  "heb": "Hebreos", "hebreos": "Hebreos",
  "sant": "Santiago", "santiago": "Santiago", "stg": "Santiago",
  "1 ped": "1 Pedro", "1 pedro": "1 Pedro", "1ped": "1 Pedro",
  "2 ped": "2 Pedro", "2 pedro": "2 Pedro", "2ped": "2 Pedro",
  "1 juan": "1 Juan", "1juan": "1 Juan",
  "2 juan": "2 Juan", "2juan": "2 Juan",
  "3 juan": "3 Juan", "3juan": "3 Juan",
  "jud": "Judas", "judas": "Judas",
  "rev": "Revelación", "revelación": "Revelación", "revelacion": "Revelación",
  "apoc": "Revelación", "apocalipsis": "Revelación",
};

// ─── Bible Reference Parser ─────────────────────────────

/**
 * Regex para citas bíblicas. Captura:
 * 1. Prefijo numérico opcional (1, 2, 3)
 * 2. Nombre/abreviatura del libro
 * 3. Capítulo
 * 4. Versículos (incluye rangos y listas: "37", "4-7", "16, 17")
 */
const BIBLE_REF_REGEX =
  /(?<prefix>[123]\s*)?(?<book>[A-ZÁÉÍÓÚa-záéíóú][a-záéíóúñ.]+(?:\s+de\s+los\s+Cantares)?)\s*\.?\s*(?<chapter>\d{1,3})\s*:\s*(?<verses>\d{1,3}(?:\s*[-–,]\s*\d{1,3})*)/gi;

export function parseBibleReferences(text: string): BibleReference[] {
  const results: BibleReference[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(BIBLE_REF_REGEX)) {
    const raw = match[0].trim();
    if (seen.has(raw.toLowerCase())) continue;
    seen.add(raw.toLowerCase());

    const prefix = (match.groups?.prefix || "").trim();
    const bookRaw = (match.groups?.book || "").trim();
    const chapter = parseInt(match.groups?.chapter || "0", 10);
    const verses = (match.groups?.verses || "").trim();

    const lookupKey = (prefix ? prefix + " " : "") + bookRaw;
    const normalized = lookupKey.toLowerCase().replace(/\.$/, "").trim();
    const bookName = BIBLE_BOOKS[normalized];

    if (!bookName) continue;
    if (chapter < 1 || chapter > 150) continue;

    results.push({ type: "bible", book: bookName, chapter, verses, raw });
  }

  return results;
}

// ─── WOL Reference Parser ───────────────────────────────

/** Códigos de publicaciones WOL reconocidos. */
const WOL_PUB_CODES = new Set([
  "w", "g", "wp", "lff", "cl", "bt", "rr", "mwb", "km",
  "it", "si", "jd", "ia", "od", "be", "bh", "lmd", "th",
  "nwt", "fg", "fy", "yp", "yb", "cf", "ct", "dp", "gt",
  "hf", "hl", "jl", "jr", "kl", "kr", "la", "lc", "lfb", "lr",
  "lv", "my", "pe", "re", "rs", "sh", "tp", "ws",
]);

/**
 * Regex para referencias WOL estilo publicación:
 * "w15 15/12 pág. 8 párrs. 16, 17"
 * "w24.04 14-15 párrs. 2-4"
 * "g20 núm. 3 pág. 10"
 * "lff lección 1 punto 3"
 * "kr pág. 84 párr. 16"
 * "nwt págs. 1846-1849"
 * "cl cap. 1 párr. 5"  — libros encuadernados citados por capítulo (sin número de página)
 */
const WOL_REF_REGEX =
  /(?<code>[a-z]{1,4})(?<year>\d{2}(?:\.\d{2})?)?\s*(?:(?<date>\d{1,2}\/\d{1,2})\s*)?(?:(?:núm\.?\s*(?<issue>\d+))\s*)?(?:(?:cap[ií]tulo|cap\.?)\s*(?<chapter>\d+)\s*)?(?:(?:p[aá]gs?\.?|p[aá]ginas?|p\.?)\s*(?<page>\d+(?:\s*[-–,]\s*\d+)*)\s*)?(?:(?:p[aá]rrs?\.?|par(?:rafo|ágrafo)?s?\.?)\s*(?<parags>\d+(?:\s*[-–,]\s*\d+)*))?(?:\s*(?:lección|leccion)\s*(?<lesson>\d+))?(?:\s*punto\s*(?<point>\d+))?/gi;

/** Regex para links de WOL. */
const WOL_LINK_REGEX = /https?:\/\/wol\.jw\.org\/([a-z]{2})\/wol\/[a-z]+\/[^\s)]+/gi;

export function parseWolReferences(text: string): (WolReference | WolLinkReference)[] {
  const results: (WolReference | WolLinkReference)[] = [];
  const seen = new Set<string>();

  // Pre-normalize page range formats like "pág. 29-pág. 30" → "págs. 29-30"
  // ponytail: do this on a copy so raw still reflects what user wrote (extended later with target suffix)
  const normalizedText = text
    .replace(/p[aá]g(?:ina)?\.?\s*(\d+)\s*[-–]\s*p[aá]g(?:ina)?\.?\s*(\d+)/gi, "págs. $1-$2")
    .replace(/p[aá]ginas?\s*(\d+)\s*a\s*(\d+)/gi, "págs. $1-$2");

  // Links directos
  for (const match of text.matchAll(WOL_LINK_REGEX)) {
    const url = match[0].trim();
    if (seen.has(url)) continue;
    seen.add(url);
    const lang = match[1] || "es";
    results.push({ type: "wol_link", url, raw: url, language: lang });
  }

  // Referencias textuales
  for (const match of normalizedText.matchAll(WOL_REF_REGEX)) {
    const raw = match[0].trim();
    if (!raw || raw.length < 3) continue;

    const code = (match.groups?.code || "").toLowerCase();
    // Validar que sea un código WOL conocido (el regex puede pescar basura)
    if (!WOL_PUB_CODES.has(code)) continue;

    // Si no hay año, exigir que haya al menos cap/pág/párr/lección/punto para no capturar basura
    const year = match.groups?.year || "";
    if (!year && !match.groups?.chapter && !match.groups?.page && !match.groups?.parags && !match.groups?.lesson && !match.groups?.point) continue;

    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const fullCode = code + year;
    const date = match.groups?.date;
    const issue = match.groups?.issue;
    const lesson = match.groups?.lesson;
    const point = match.groups?.point;
    const chapter = match.groups?.chapter ? parseInt(match.groups.chapter, 10) : undefined;

    // Parse page and endPage from a range ("20-25") or a list ("133, 134")
    let page: number | undefined;
    let endPage: number | undefined;
    if (match.groups?.page) {
      const pageStr = match.groups.page;
      if (pageStr.includes("-") || pageStr.includes("–") || pageStr.includes(",")) {
        const pages = parseNumberList(pageStr.replace(/[-–]/g, ","));
        page = pages[0];
        endPage = pages.length > 1 ? pages[pages.length - 1] : undefined;
      } else {
        page = parseInt(pageStr, 10);
      }
    }

    let paragraphs: number[] | undefined;
    if (match.groups?.parags) {
      paragraphs = parseNumberList(match.groups.parags);
    }

    // Detect target from surrounding text after the match
    let target: WolReference["target"];
    const matchEnd = (match.index ?? 0) + raw.length;
    const afterMatch = normalizedText.slice(matchEnd, matchEnd + 30);
    let rawExtended = raw; // ponytail: extend raw to include target suffix for full fidelity
    if (/^,?\s*recuadro/i.test(afterMatch)) {
      target = "box";
      const suffixMatch = afterMatch.match(/^(,?\s*recuadro)/i);
      if (suffixMatch) rawExtended = raw + suffixMatch[1];
    } else if (/^,?\s*nota/i.test(afterMatch)) {
      target = "note";
      const suffixMatch = afterMatch.match(/^(,?\s*nota)/i);
      if (suffixMatch) rawExtended = raw + suffixMatch[1];
    } else if (paragraphs?.length) {
      target = "paragraphs";
    } else if (page != null) {
      target = "pages";
    }

    results.push({
      type: "wol",
      publicationCode: fullCode,
      date,
      chapter,
      page,
      endPage,
      paragraphs,
      lesson,
      point,
      issue,
      target,
      raw: rawExtended,
      language: "es",
    });
  }

  return results;
}

// ─── Combined Parser ─────────────────────────────────────

export interface ParseResult {
  bibleRefs: BibleReference[];
  wolRefs: (WolReference | WolLinkReference)[];
  allRefs: ParsedReference[];
}

/**
 * Parsea todo el texto del usuario y devuelve todas las referencias detectadas.
 */
export function parseAllReferences(text: string): ParseResult {
  const bibleRefs = parseBibleReferences(text);
  const wolRefs = parseWolReferences(text);
  return {
    bibleRefs,
    wolRefs,
    allRefs: [...bibleRefs, ...wolRefs],
  };
}

// ─── Helpers ─────────────────────────────────────────────

/** Parsea listas de números como "16, 17" o "2-4" a un array [16,17] o [2,3,4]. */
function parseNumberList(input: string): number[] {
  const result: number[] = [];
  const parts = input.split(/\s*,\s*/);
  for (const part of parts) {
    if (part.includes("-") || part.includes("–")) {
      const [a, b] = part.split(/[-–]/).map((s) => parseInt(s.trim(), 10));
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


// ─── Source Integrity (strict separation: verified sources vs AI commentary) ───
export {
  type VerifiedSource,
  type UnverifiedSource,
  type ResearchSource,
  type AICommentary,
  type SourceOrigin,
  type SourceType,
  type SourceMetadata,
  type IntegrityIssue,
  validateVerifiedSourceIntegrity,
  enforceSourceIntegrity,
  countVerifiedSources,
  sanitizeAIInjectedSource,
  detectAIGeneratedText,
} from "./source-integrity.js";

// ─── Compound Question Parser ────────────────────────────
export {
  type QuestionIntent,
  type DetectedQuestion,
  type CompoundQuestionResult,
  type SourceVerificationStatus,
  type ResponseValidation,
  parseCompoundQuestion,
  determineSourceStatus,
  validateResponseCoverage,
} from "./compound-question-parser.js";
