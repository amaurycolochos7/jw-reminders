import {
  requiresAssistant,
  mapWolTitleToType,
  mapWolTitleToSection,
  normalizeTitle,
} from "@jw-reminders/shared";

/**
 * Item de programa extraído de WOL (forma pura, sin depender de Prisma).
 * Se persiste luego como `MeetingProgramItem`.
 */
export interface ParsedProgramItem {
  itemNumber: number | null;
  section: string | null;
  title: string;
  assignmentType: string;
  durationMinutes: number | null;
  context: string | null;
  description: string | null;
  reference: string | null;
  lesson: string | null;
  requiresAssistant: boolean;
  sortOrder: number;
  rawText: string;
}

export interface ParseWolResult {
  items: ParsedProgramItem[];
  warnings: string[];
}

/**
 * Títulos de las partes que hoy nos interesa extraer. El parser sólo emite
 * items cuyo encabezado coincide con uno de estos (evita capturar cánticos,
 * tesoros, etc.). Fácil de ampliar.
 */
const TARGET_TITLES = [
  "lectura de la biblia",
  "empiece conversaciones",
  "primera conversacion",
  "haga revisitas",
  "revisita",
  "haga discipulos",
  "explique sus creencias",
  "curso biblico",
  "discurso",
];

function isTargetTitle(title: string): boolean {
  const n = normalizeTitle(title);
  return TARGET_TITLES.some((t) => n.includes(t));
}

/**
 * Marcadores de límite: encabezados de sección, cánticos, cierre y pie de página
 * de WOL. Al toparse con uno, termina el cuerpo de la asignación en curso (evita
 * arrastrar contenido de otras secciones o del footer).
 */
const STOP_MARKERS = [
  "tesoros de la biblia",
  "seamos mejores maestros",
  "nuestra vida cristiana",
  "cancion",
  "cantico",
  "necesidades",
  "estudio biblico de la congregacion",
  "palabras de introduccion",
  "palabras de conclusion",
  "busquemos perlas escondidas",
  "analicemos",
  "publicaciones",
  "cerrar sesion",
  "iniciar sesion",
  "copyright",
  "condiciones de uso",
  "politica de privacidad",
  "configuracion",
  "compartir",
  "jw.org",
];

function isStopMarker(line: string): boolean {
  const n = normalizeTitle(line);
  return STOP_MARKERS.some((m) => n === m || n.startsWith(`${m} `) || n.startsWith(`${m}.`));
}

/** Línea que es un encabezado en MAYÚSCULAS (sección), sin minúsculas ni dígitos. */
function isAllCapsHeaderLine(line: string): boolean {
  const t = line.trim();
  if (/[a-záéíóúñü]/.test(t)) return false; // tiene minúsculas → no es header de sección
  if (!/[A-ZÁÉÍÓÚÑÜ]/.test(t)) return false;
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÑÜ]/g, "");
  return letters.length >= 6 && t.split(/\s+/).length >= 2;
}

/** Corta la descripción en el primer marcador de sección/pie que se haya colado. */
function sanitizeDescription(text: string): string {
  const cut = text.replace(
    /\s*(SEAMOS MEJORES MAESTROS|NUESTRA VIDA CRISTIANA|TESOROS DE LA BIBLIA|BUSQUEMOS PERLAS ESCONDIDAS|Canci[oó]n\b|C[aá]ntico\b|Necesidades de|Estudio b[ií]blico|Palabras de (introducci[oó]n|conclusi[oó]n)|Publicaciones|Cerrar sesi[oó]n|Iniciar sesi[oó]n|Copyright|Condiciones de uso|Pol[ií]tica de privacidad)[\s\S]*$/,
    "",
  );
  return cut;
}

/** Normaliza espacios, saltos de línea repetidos y espacios antes de puntos. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** "(4 mins.)" | "(4 min.)" | "(4 min)" → 4 */
function extractDuration(text: string): { minutes: number | null; rest: string } {
  const m = text.match(/\(\s*(\d+)\s*mins?\.?\s*\)/i);
  if (!m) return { minutes: null, rest: text };
  const minutes = parseInt(m[1], 10);
  const rest = (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).trim();
  return { minutes, rest };
}

/** "(th lección 14)" o "th lección 14" → "th lección 14" */
function extractLesson(text: string): { lesson: string | null; rest: string } {
  const paren = text.match(/\(\s*(th\s+lecci[oó]n[^)]*)\)/i);
  if (paren) {
    const lesson = paren[1].trim();
    const rest = (text.slice(0, paren.index) + text.slice((paren.index ?? 0) + paren[0].length)).trim();
    return { lesson, rest };
  }
  const bare = text.match(/\bth\s+lecci[oó]n\s+\d+\b/i);
  if (bare) {
    const lesson = bare[0].trim();
    const rest = (text.slice(0, bare.index) + text.slice((bare.index ?? 0) + bare[0].length)).trim();
    return { lesson, rest };
  }
  return { lesson: null, rest: text };
}

/**
 * Referencia de publicación (lmd/lff/etc.). Puede venir entre paréntesis
 * "(lmd lección 1 punto 4)" o al inicio "lmd apéndice A punto 17.".
 */
function extractReference(text: string): { reference: string | null; rest: string } {
  const paren = text.match(/\(\s*((?:lmd|lff|be|jy|cl|bt|ia|kr|rr|od)\b[^)]*)\)/i);
  if (paren) {
    const cleaned = paren[1].trim();
    const rest = (text.slice(0, paren.index) + text.slice((paren.index ?? 0) + paren[0].length)).trim();
    return { reference: cleaned, rest };
  }
  // Referencia al inicio del cuerpo, hasta el primer punto: "lmd apéndice A punto 17."
  const lead = text.match(/^\s*((?:lmd|lff|be|jy|cl|bt|ia|kr|rr|od)\b[^.]*)\./i);
  if (lead) {
    const reference = lead[1].trim();
    const rest = text.slice((lead.index ?? 0) + lead[0].length).trim();
    return { reference, rest };
  }
  return { reference: null, rest: text };
}

/**
 * Contexto: fragmento en MAYÚSCULAS al inicio del cuerpo, terminado en punto.
 * Ej.: "PREDICACIÓN INFORMAL." | "DE CASA EN CASA."
 */
function extractContext(text: string): { context: string | null; rest: string } {
  const m = text.match(/^\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ ]{2,})\.(\s|$)/);
  if (!m) return { context: null, rest: text };
  const context = m[1].trim();
  const rest = text.slice((m.index ?? 0) + m[0].length).trim();
  return { context, rest };
}

/** Limpia puntuación colgante y espacios sobrantes. */
function tidy(text: string | null): string | null {
  if (text == null) return null;
  const t = text.replace(/\s+/g, " ").replace(/\s*\.\s*$/, "").replace(/^\.\s*/, "").trim();
  return t.length ? t : null;
}

/**
 * Parsea el texto plano de una sección de programa de WOL y extrae los items
 * de asignación reconocidos (Lectura de la Biblia, Empiece conversaciones,
 * Haga revisitas, Discurso, etc.).
 *
 * No inventa datos: si no reconoce nada, devuelve `items: []` y una advertencia.
 *
 * @param rawText  Texto visible de la página (o de la sección de Vida y Ministerio).
 * @param sourceUrl URL de WOL de donde salió el texto (para auditoría).
 */
export function parseWolProgram(rawText: string, _sourceUrl = ""): ParseWolResult {
  const warnings: string[] = [];
  const text = normalizeWhitespace(rawText || "");
  if (!text) return { items: [], warnings: ["Texto vacío: no se pudo extraer ninguna asignación."] };

  const lines = text.split("\n");
  const items: ParsedProgramItem[] = [];
  let sortOrder = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    // Encabezado: "4. Empiece conversaciones" o "Lectura de la Biblia".
    const headed = line.match(/^\s*(\d{1,2})\.\s+(.*)$/);
    const itemNumber = headed ? parseInt(headed[1], 10) : null;
    const titleCandidate = headed ? headed[2].trim() : line;

    if (!isTargetTitle(titleCandidate)) continue;

    // El cuerpo son las líneas siguientes hasta un límite: otra parte objetivo,
    // otro encabezado numerado, un encabezado de sección en MAYÚSCULAS, o un
    // marcador de sección/cántico/cierre/pie de página.
    let body = "";
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const next = lines[j].trim();
      if (!next) break;
      const nextHeaded = next.match(/^\s*(\d{1,2})\.\s+(.*)$/);
      const nextTitle = nextHeaded ? nextHeaded[2].trim() : next;
      if (isTargetTitle(nextTitle)) break;
      if (nextHeaded) break;            // cualquier parte numerada inicia otro item
      if (isStopMarker(next)) break;    // sección / cántico / cierre / footer
      if (isAllCapsHeaderLine(next)) break; // encabezado de sección en MAYÚSCULAS
      body += (body ? " " : "") + next;
    }
    i = j - 1;

    const rawItem = `${headed ? headed[0].trim() : line}\n${body}`.trim();

    const { minutes, rest: afterDuration } = extractDuration(body);
    const { lesson, rest: afterLesson } = extractLesson(afterDuration);
    const { context, rest: afterContext } = extractContext(afterLesson);
    const { reference, rest: afterReference } = extractReference(afterContext);

    const description = tidy(sanitizeDescription(afterReference));
    const type = mapWolTitleToType(titleCandidate);

    items.push({
      itemNumber,
      section: mapWolTitleToSection(titleCandidate),
      title: titleCandidate.replace(/\s*\.\s*$/, "").trim(),
      assignmentType: type,
      durationMinutes: minutes,
      context: context ? context.replace(/\s*\.\s*$/, "").trim() : null,
      description,
      reference: tidy(reference),
      lesson: tidy(lesson),
      requiresAssistant: requiresAssistant(titleCandidate),
      sortOrder: sortOrder++,
      rawText: rawItem,
    });
  }

  if (items.length === 0) {
    warnings.push("No se reconoció ninguna asignación conocida en el texto de WOL.");
  }

  return { items, warnings };
}
