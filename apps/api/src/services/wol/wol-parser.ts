import {
  requiresAssistant,
  mapWolTitleToType,
  mapWolTitleToSection,
  deriveSection,
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
  /**
   * Fase 3: false = parte informativa (p. ej. canción) que se muestra pero NO
   * genera slot/asignación/recordatorio. Por defecto true (asignable).
   */
  requiresAssignee?: boolean;
  sortOrder: number;
  rawText: string;
}

export interface ParseWolResult {
  items: ParsedProgramItem[];
  warnings: string[];
}

/**
 * Títulos de partes de título FIJO que el parser reconoce por su texto. Cubren
 * las partes SMM históricas y las partes de reunión (Fase 3) con nombre estable
 * (perlas, introducción, conclusión, estudio bíblico de la congregación,
 * canciones). Las partes de TÍTULO VARIABLE (Tesoros punto 1, partes de Nuestra
 * Vida Cristiana) NO están aquí: se detectan por la sección en curso.
 * El tipo real siempre lo decide `mapWolTitleToType`; esta lista sólo decide qué
 * encabezados emiten item.
 */
const TARGET_TITLES = [
  // SMM (sin cambios)
  "lectura de la biblia",
  "empiece conversaciones",
  "primera conversacion",
  "haga revisitas",
  "revisita",
  "haga discipulos",
  "explique sus creencias",
  "curso biblico",
  "discurso",
  // Fase 3: partes de reunión con título fijo
  "busquemos perlas escondidas",
  "perlas escondidas",
  "palabras de introduccion",
  "palabras de conclusion",
  "estudio biblico de la congregacion",
  "cancion",
  "cantico",
];

function isTargetTitle(title: string): boolean {
  const n = normalizeTitle(title);
  return TARGET_TITLES.some((t) => n.includes(t));
}

/**
 * Sección en curso derivada de un encabezado en MAYÚSCULAS de WOL. Se usa para
 * detectar las partes de TÍTULO VARIABLE: el punto 1 de "Tesoros de la Biblia"
 * y las partes (1..N) de "Nuestra Vida Cristiana", que no tienen texto fijo.
 */
function detectSectionHeader(line: string): "TREASURES" | "SMM" | "LIVING" | null {
  const n = normalizeTitle(line);
  if (n === "tesoros de la biblia" || n.startsWith("tesoros de la biblia")) return "TREASURES";
  if (n === "seamos mejores maestros" || n.startsWith("seamos mejores maestros")) return "SMM";
  if (n === "nuestra vida cristiana" || n.startsWith("nuestra vida cristiana")) return "LIVING";
  return null;
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

  // Algunas líneas de WOL combinan dos partes con " | " (p. ej.
  // "Palabras de conclusión (3 mins.) | Canción 69 y oración"). Las separamos
  // para tratar cada parte como una línea independiente.
  const lines = text
    .split("\n")
    .flatMap((l) => l.split("|").map((s) => s.trim()))
    .filter((l) => l.length > 0);
  const items: ParsedProgramItem[] = [];
  let sortOrder = 0;
  // Sección en curso: fija el tipo de las partes de TÍTULO VARIABLE (Tesoros
  // punto 1 → TREASURES_TALK; partes de Nuestra Vida Cristiana → CHRISTIAN_LIVING).
  let currentSection: "TREASURES" | "SMM" | "LIVING" | null = null;

  const DURATION_RE = /\(\s*\d+\s*mins?\.?\s*\)/i;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    // Encabezado de sección en MAYÚSCULAS: sólo actualiza el contexto de sección.
    const sec = detectSectionHeader(line);
    if (sec) {
      currentSection = sec;
      continue;
    }

    // Encabezado: "4. Empiece conversaciones" o "Lectura de la Biblia".
    const headed = line.match(/^\s*(\d{1,2})\.\s+(.*)$/);
    const itemNumber = headed ? parseInt(headed[1], 10) : null;
    const afterNumber = headed ? headed[2].trim() : line;

    // Las partes de reunión traen título Y duración en la MISMA línea
    // ("Palabras de introducción (1 min.)"). El título es lo que va ANTES del
    // marcador de duración; el resto (marcador + detalles) es cuerpo en línea.
    const durMatch = afterNumber.match(DURATION_RE);
    let titleCandidate: string;
    let inlineRest = "";
    if (durMatch && durMatch.index !== undefined) {
      titleCandidate = afterNumber.slice(0, durMatch.index).trim();
      inlineRest = afterNumber.slice(durMatch.index).trim();
    } else {
      titleCandidate = afterNumber;
    }

    // Clasificación. Prioridad 1: título FIJO reconocido (SMM + partes de
    // reunión con nombre estable) → conserva EXACTAMENTE el comportamiento SMM.
    // Prioridad 2: partes de TÍTULO VARIABLE según la sección en curso.
    const isFixedTarget = titleCandidate.length > 0 && isTargetTitle(titleCandidate);
    let variableType: "TREASURES_TALK" | "CHRISTIAN_LIVING" | null = null;
    if (!isFixedTarget && titleCandidate.length > 0 && headed) {
      if (currentSection === "TREASURES") variableType = "TREASURES_TALK";
      else if (currentSection === "LIVING") variableType = "CHRISTIAN_LIVING";
    }
    if (!isFixedTarget && !variableType) continue;

    // El cuerpo son las líneas siguientes hasta un límite: otra parte objetivo,
    // otro encabezado numerado, un encabezado de sección en MAYÚSCULAS, o un
    // marcador de sección/cántico/cierre/pie de página. Empieza por el resto en
    // línea (partes de reunión) que ya trae duración/detalles.
    let body = inlineRest;
    let follow = "";
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const next = lines[j].trim();
      if (!next) break;
      const nextHeaded = next.match(/^\s*(\d{1,2})\.\s+(.*)$/);
      const nextTitle = nextHeaded ? nextHeaded[2].trim() : next;
      // Sólo un ENCABEZADO objetivo (sin duración al inicio) inicia otro item.
      if (isTargetTitle(nextTitle) && !next.match(/^\s*\(\s*\d+\s*mins?/i)) break;
      if (nextHeaded) break;            // cualquier parte numerada inicia otro item
      if (isStopMarker(next)) break;    // sección / cántico / cierre / footer
      if (isAllCapsHeaderLine(next)) break; // encabezado de sección en MAYÚSCULAS
      if (detectSectionHeader(next)) break;
      follow += (follow ? " " : "") + next;
    }
    i = j - 1;
    if (follow) body = body ? `${body} ${follow}` : follow;

    const rawItem = follow ? `${line}\n${follow}` : line;

    const { minutes, rest: afterDuration } = extractDuration(body);
    const { lesson, rest: afterLesson } = extractLesson(afterDuration);
    const { context, rest: afterContext } = extractContext(afterLesson);
    const { reference, rest: afterReference } = extractReference(afterContext);

    const description = tidy(sanitizeDescription(afterReference));
    const type = variableType ?? mapWolTitleToType(titleCandidate);
    const section = variableType ? deriveSection(variableType) : mapWolTitleToSection(titleCandidate);

    items.push({
      itemNumber,
      section,
      title: titleCandidate.replace(/\s*\.\s*$/, "").trim(),
      assignmentType: type,
      durationMinutes: minutes,
      context: context ? context.replace(/\s*\.\s*$/, "").trim() : null,
      description,
      reference: tidy(reference),
      lesson: tidy(lesson),
      requiresAssistant: requiresAssistant(titleCandidate),
      // Fase 3: sólo las canciones son informativas (no generan asignación).
      requiresAssignee: type === "SONG" ? false : true,
      sortOrder: sortOrder++,
      rawText: rawItem,
    });
  }

  if (items.length === 0) {
    warnings.push("No se reconoció ninguna asignación conocida en el texto de WOL.");
  }

  return { items, warnings };
}
