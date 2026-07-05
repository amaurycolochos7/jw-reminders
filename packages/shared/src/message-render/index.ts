/**
 * RENDER ÚNICO de mensajes de WhatsApp (fuente de verdad del texto).
 *
 * Núcleo PURO (sin DB, sin red). El MISMO `renderMessage` lo consumen:
 *  - el frontend, para el preview del editor de plantillas;
 *  - el backend, al GENERAR una automatización (produce el snapshot congelado);
 *  - las pruebas deterministas.
 *
 * Objetivo de diseño (auditoría → reestructuración robusta):
 *   previewDelPanel === renderedMessageGuardado === mensajeEnviadoPorWhatsApp
 *
 * Reglas de fidelidad de formato WhatsApp:
 *  - NO se sanitiza ni se normaliza el texto: los `*negritas*`, `_cursivas_`,
 *    guiones, viñetas, saltos de línea, espacios y emojis que el usuario escribe
 *    se conservan tal cual. El sistema NO impone emojis.
 *  - La sustitución solo reemplaza tokens `{{variable}}` por su valor.
 *  - Por defecto NO se podan líneas: lo que se ve es lo que se envía. (El bloque
 *    `{{listaAsignaciones}}` se genera aparte y se inyecta como una variable más.)
 */

export interface TemplateVariableDef {
  /** Nombre del token tal como se escribe entre llaves dobles (sin las llaves). */
  name: string;
  /** Descripción legible para el panel. */
  description: string;
  /** Ejemplo de valor para el preview y la documentación. */
  example: string;
  /** Tipos de mensaje donde la variable tiene sentido (claves de plantilla). */
  appliesTo: TemplateTypeKey[];
  /** Si es obligatoria: su ausencia/valor vacío genera `missingVariables`. */
  required: boolean;
}

/** Tipos de mensaje ACTIVOS del sistema (los únicos que el panel expone). */
export type TemplateTypeKey =
  | "INITIAL_NOTICE"
  | "SEVEN_DAYS_BEFORE"
  | "THREE_DAYS_BEFORE"
  | "ONE_DAY_BEFORE"
  | "CHANGE_NOTICE";

export const ACTIVE_TEMPLATE_TYPES: TemplateTypeKey[] = [
  "INITIAL_NOTICE",
  "SEVEN_DAYS_BEFORE",
  "THREE_DAYS_BEFORE",
  "ONE_DAY_BEFORE",
  "CHANGE_NOTICE",
];

const ALL: TemplateTypeKey[] = ACTIVE_TEMPLATE_TYPES;
const REMINDERS: TemplateTypeKey[] = ["SEVEN_DAYS_BEFORE", "THREE_DAYS_BEFORE", "ONE_DAY_BEFORE"];

/**
 * CATÁLOGO OFICIAL de variables. Es la fuente que documenta el panel y contra la
 * que se valida una plantilla. Los nombres salen del dominio real del sistema.
 */
export const TEMPLATE_VARIABLES: TemplateVariableDef[] = [
  { name: "nombre",            description: "Nombre visible del destinatario (displayName o nombre completo).", example: "Carlos",                         appliesTo: ALL,        required: true },
  { name: "telefono",          description: "Teléfono al que se enviará el mensaje.",                            example: "5219611234567",                  appliesTo: ALL,        required: false },
  { name: "listaAsignaciones", description: "Bloque autogenerado con las asignaciones de la persona, ya formateado (fecha, sección, título, rol/acompañante). Editable en el mensaje final.", example: "*Viernes 10 de julio*\n• Punto 3\n*Lectura de la Biblia*", appliesTo: ALL, required: true },
  { name: "asignacion",        description: "Título de la asignación (una sola parte).",                         example: "Lectura de la Biblia",           appliesTo: [...REMINDERS, "CHANGE_NOTICE"], required: false },
  { name: "seccion",           description: "Sección/tipo de la parte (etiqueta).",                              example: "Seamos Mejores Maestros",        appliesTo: [...REMINDERS, "CHANGE_NOTICE"], required: false },
  { name: "punto",             description: "Número del punto en el programa (WOL), si aplica.",                 example: "3",                              appliesTo: [...REMINDERS, "CHANGE_NOTICE"], required: false },
  { name: "companero",         description: "Nombre del acompañante/estudiante, si aplica.",                     example: "Hermano López",                  appliesTo: [...REMINDERS, "CHANGE_NOTICE"], required: false },
  { name: "fecha",             description: "Fecha de la reunión, ya formateada en español.",                    example: "viernes 10 de julio de 2026",    appliesTo: [...REMINDERS, "CHANGE_NOTICE"], required: false },
  { name: "hora",              description: "Hora de la reunión (12h), ya formateada.",                          example: "7:00 p.m.",                      appliesTo: [...REMINDERS, "CHANGE_NOTICE"], required: false },
  { name: "semana",            description: "Rango de la semana de la reunión.",                                 example: "6 a 12 de julio",                appliesTo: [...REMINDERS, "CHANGE_NOTICE"], required: false },
  { name: "mes",               description: "Nombre del mes del periodo (para el aviso inicial).",               example: "julio",                          appliesTo: ["INITIAL_NOTICE"], required: false },
  { name: "nombreCongregacion",description: "Nombre de la congregación configurado.",                            example: "Congregación Centro",            appliesTo: ALL,        required: false },
];

/** Alias aceptados para tolerar acentos (p. ej. {{compañero}} → companero). */
const VARIABLE_ALIASES: Record<string, string> = {
  "compañero": "companero",
  "asignación": "asignacion",
  "sección": "seccion",
  "teléfono": "telefono",
};

const KNOWN_NAMES = new Set(TEMPLATE_VARIABLES.map((v) => v.name));

function canonicalName(raw: string): string {
  return VARIABLE_ALIASES[raw] ?? raw;
}

/** Token bien formado: {{ nombre }} con letras/números/_ (unicode). */
const TOKEN_RE = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;

export interface RenderResult {
  /** Texto final tras sustituir variables. Fiel byte a byte al envío. */
  renderedMessage: string;
  /** Variables CONOCIDAS usadas en el cuerpo cuyo valor llegó vacío/ausente. */
  missingVariables: string[];
  /** Tokens usados que NO existen en el catálogo ni se proveyeron. */
  invalidVariables: string[];
  /** Avisos no bloqueantes (sintaxis malformada, cuerpo vacío, etc.). */
  warnings: string[];
}

export interface RenderOptions {
  /**
   * Tipo de mensaje: si se indica, se valida que las variables usadas apliquen
   * a ese tipo (variables que no aplican → warning). No bloquea el render.
   */
  templateType?: TemplateTypeKey;
  /**
   * Si true, los tokens desconocidos se reemplazan por "" en la salida en vez de
   * dejarse visibles. Por defecto false (se dejan visibles para que salten a la
   * vista en el editor). El envío real NO debería usar esto: se valida antes.
   */
  blankUnknown?: boolean;
}

/**
 * Renderiza una plantilla sustituyendo `{{variable}}` por sus valores y devuelve
 * diagnósticos. NO altera el formato del texto del usuario.
 */
export function renderMessage(
  body: string,
  variables: Record<string, string | null | undefined>,
  opts: RenderOptions = {},
): RenderResult {
  const warnings: string[] = [];
  const missing = new Set<string>();
  const invalid = new Set<string>();
  const notApplicable = new Set<string>();

  if (!body || body.trim().length === 0) {
    warnings.push("La plantilla está vacía.");
  }

  // 1) Detección de llaves malformadas (p. ej. "{{nombre" o "nombre}}").
  const withoutTokens = body.replace(TOKEN_RE, "");
  if (withoutTokens.includes("{{") || withoutTokens.includes("}}")) {
    warnings.push("Hay llaves de variable sin cerrar o mal formadas (revisa {{ y }}).");
  }

  const applicableFor = (name: string): boolean => {
    if (!opts.templateType) return true;
    const def = TEMPLATE_VARIABLES.find((v) => v.name === name);
    return def ? def.appliesTo.includes(opts.templateType) : true;
  };

  // 2) Sustitución de tokens bien formados.
  const rendered = body.replace(TOKEN_RE, (match, rawName: string) => {
    const name = canonicalName(rawName);
    const provided = Object.prototype.hasOwnProperty.call(variables, name)
      ? variables[name]
      : Object.prototype.hasOwnProperty.call(variables, rawName)
        ? variables[rawName]
        : undefined;
    const known = KNOWN_NAMES.has(name);

    if (!known && provided === undefined) {
      invalid.add(rawName);
      return opts.blankUnknown ? "" : match; // dejar visible por defecto
    }

    if (known && !applicableFor(name)) notApplicable.add(name);

    const value = provided == null ? "" : String(provided);
    if (known && value.trim().length === 0) missing.add(name);
    return value;
  });

  // 3) Avisos de obligatorias y de no-aplicables.
  for (const name of missing) {
    const def = TEMPLATE_VARIABLES.find((v) => v.name === name);
    if (def?.required) warnings.push(`Falta la variable obligatoria {{${name}}}.`);
  }
  for (const name of notApplicable) {
    warnings.push(`La variable {{${name}}} no aplica al tipo de mensaje ${opts.templateType}.`);
  }
  if (invalid.size > 0) {
    warnings.push(`Variables no reconocidas: ${[...invalid].map((n) => `{{${n}}}`).join(", ")}.`);
  }

  return {
    renderedMessage: rendered,
    missingVariables: [...missing],
    invalidVariables: [...invalid],
    warnings,
  };
}

/** Extrae los nombres de variable (canónicos) usados en un cuerpo de plantilla. */
export function extractVariables(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(TOKEN_RE)) found.add(canonicalName(m[1]));
  return [...found];
}

/** Valida una plantilla sin datos: útil al guardar en el panel. */
export function validateTemplate(body: string, templateType?: TemplateTypeKey): RenderResult {
  // Render con TODAS las variables del catálogo como presentes (valor de ejemplo)
  // para NO reportar "faltantes" al validar estructura; interesa sintaxis + no
  // reconocidas + no aplicables.
  const sample: Record<string, string> = {};
  for (const v of TEMPLATE_VARIABLES) sample[v.name] = v.example;
  return renderMessage(body, sample, { templateType });
}

/** Mapa de variables de ejemplo (para el preview del editor con datos ficticios). */
export function sampleVariables(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of TEMPLATE_VARIABLES) out[v.name] = v.example;
  return out;
}

/**
 * Spintax: reemplaza {opción1|opción2|opción3} con una variante aleatoria.
 * Permite que cada mensaje sea ligeramente diferente para evitar detección de spam.
 * Ejemplo: "{Hola|Buenos días|Saludos} {nombre}" → "Buenos días Juan"
 */
export function parseSpintax(text: string): string {
  if (!text) return text;
  let result = text;
  let matches;
  // ponytail: regex simple, un solo nivel de anidamiento
  while ((matches = result.match(/\{([^{}]+)\}/))) {
    const options = matches[1].split("|");
    const randomOpt = options[Math.floor(Math.random() * options.length)];
    result = result.replace(matches[0], randomOpt);
  }
  return result;
}
