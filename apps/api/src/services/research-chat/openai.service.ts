/**
 * OpenAI integration service for Research Chat.
 *
 * Calls OpenAI API directly via fetch (no SDK dependency needed).
 * Uses structured JSON output, timeout, single retry, and never leaks the key.
 */

import type { ResolvedReference } from "./wol-resolver.service.js";

// ─── Types ───────────────────────────────────────────────

export interface ResearchChatOptions {
  outputType?: "comments" | "summary" | "main_ideas" | "spiritual_gem" | "simple_explanation";
  level?: "auto" | "directo" | "natural" | "razonado" | "profundo" | "mixed";
  duration?: "auto" | "15" | "30" | "60" | "mixed";
  language?: string;
}

export interface SourceFinding {
  type: string;
  reference: string;
  title?: string;
  url?: string;
  status: string;
  notes?: string;
}

export interface CommentVariant {
  text: string;
  whyItWorks: string;
  usedSourceRefs: string[];
}

export interface GeneratedCommentGroup {
  type: "directo" | "natural" | "razonado" | "profundo";
  durationSeconds: number;
  variants: CommentVariant[];
}

const DEFAULT_VARIANT_COUNT = 2;

export interface SourceHighlight {
  sourceReference: string;
  paragraphNumber?: number;
  exactText: string;
  reason?: string;
}

export interface AssistantResponse {
  mode: string;
  questionType: string;
  reasoningLevel: string;
  summary: string;
  biblicalBasis: Array<{ reference: string; text: string; usedSourceRef?: string }>;
  additionalReferences: Array<{ source: string; reference: string; note: string }>;
  application: string | null;
  sourceFindings: SourceFinding[];
  comments: GeneratedCommentGroup[];
  sourceHighlights: SourceHighlight[];
  warnings: string[];
  followUpSuggestions: string[];
  confidenceNote: string | null;
}

export interface AiRunMetadata {
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  status: "success" | "failed";
  error?: string;
}

// ─── Config ──────────────────────────────────────────────

function getConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.4-nano";
  if (!apiKey) throw new Error("OPENAI_API_KEY no configurada");
  return { apiKey, model };
}

// ─── Prompt builder ──────────────────────────────────────

function buildSystemPrompt(systemPromptContent: string): string {
  return systemPromptContent;
}

function buildUserPrompt(
  userMessage: string,
  resolvedRefs: ResolvedReference[],
  options: ResearchChatOptions,
  unresolvedExplicitRefs?: Array<{ raw: string; type: string; status: string; notes?: string }>,
  explicitReferenceOnlyMode?: boolean,
  variantCount: number = DEFAULT_VARIANT_COUNT,
): string {
  let prompt = "";

  // ─── EXPLICIT_REFERENCE_ONLY mode header ───
  if (explicitReferenceOnlyMode) {
    prompt += `MODO: EXPLICIT_REFERENCE_ONLY
REGLA ABSOLUTA: Solo puedes usar las fuentes verificadas proporcionadas abajo.
- NO agregues textos bíblicos que no estén DENTRO del texto extraído de la fuente principal.
- NO uses Habacuc, Ezequiel, Daniel, Isaías, Mateo, Revelación ni ningún otro texto bíblico como base si no aparece citado textualmente dentro de la fuente principal proporcionada.
- La "biblicalBasis" SOLO puede contener textos que aparezcan CITADOS LITERALMENTE dentro del texto extraído de la fuente.
- Si la fuente no cita ningún texto bíblico, devuelve biblicalBasis como array vacío.
- NO hagas razonamiento espiritual genérico. Basa TODO en el texto extraído.
- additionalReferences DEBE ser un array vacío.

`;}

  // Only include sources that are truly resolved with real content
  const verifiedSources = resolvedRefs.filter(
    (ref) => ref.status === "resolved" && (ref.excerpt || (ref.type === "bible" && ref.extractedContent && ref.extractedContent.length > 0))
  );

  if (verifiedSources.length > 0) {
    prompt += "REFERENCIAS EXPLÍCITAS DEL USUARIO — PRIORIDAD MÁXIMA:\n";
    prompt += "(Estas referencias fueron proporcionadas directamente por el usuario. Debes usarlas como base principal de tu respuesta.)\n\n";
    for (const ref of verifiedSources) {
      prompt += `- [${ref.type}] ${ref.raw}`;
      if (ref.title) prompt += ` | Título: ${ref.title}`;
      // Send per-paragraph content when available
      if (ref.extractedContent && ref.extractedContent.length > 0) {
        prompt += "\n  Contenido extraído por párrafo:";
        for (const p of ref.extractedContent) {
          prompt += `\n    ${p.label}: ${p.text}`;
        }
      } else if (ref.excerpt) {
        prompt += `\n  Contenido extraído: ${ref.excerpt}`;
      }
      if (ref.url) prompt += `\n  URL: ${ref.url}`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  // Inform AI about unresolved explicit refs
  if (unresolvedExplicitRefs && unresolvedExplicitRefs.length > 0) {
    prompt += "REFERENCIAS EXPLÍCITAS NO RESUELTAS:\n";
    prompt += "(El usuario proporcionó estas referencias pero no se pudo obtener su contenido. NO inventes el contenido. Indica claramente que no se pudo verificar.)\n";
    for (const ref of unresolvedExplicitRefs) {
      prompt += `- ${ref.raw} — Motivo: ${ref.notes || ref.status}\n`;
    }
    prompt += "\n";
  }

  prompt += `MENSAJE DEL USUARIO:\n${userMessage}\n\n`;

  // Instrucciones de formato
  prompt += "INSTRUCCIONES DE FORMATO:\n";
  prompt += `- Tipo de salida: ${options.outputType || "comments"}\n`;
  prompt += `- Nivel solicitado: ${options.level || "auto"}\n`;
  prompt += `- Duración objetivo: ${options.duration || "auto"}\n`;
  prompt += `- Idioma: ${options.language || "es"}\n`;
  prompt += "\n";

  // Source-gating + highlight rules
  prompt += `REGLAS OBLIGATORIAS DE FUENTES:
- Solo puedes generar resumen, explicación o comentarios si el sistema te entregó texto real en "FUENTES VERIFICADAS CON CONTENIDO REAL" arriba.
- No generes contenido basado en una referencia que no tenga contenido resuelto.
- Solo puedes decir "según la fuente" o "la referencia explica" si el sistema te entregó texto real de esa fuente.
- No infieras el contenido de una publicación solo por su título, fecha, página o referencia.
- No inventes información para llenar el vacío.
- Basa tus comentarios SOLO en el texto real proporcionado arriba.
- Recibirás fuentes ya resueltas con contenido real. Usa solo ese contenido para generar comentarios.
- También debes devolver las frases exactas del contenido que usaste como evidencia en "sourceHighlights".
- Las frases exactas deben existir LITERALMENTE en el texto de la fuente. Copia el fragmento tal cual aparece.
- Si una idea no está en la fuente, no la presentes como si viniera de ella.

`;

  prompt += `Responde ÚNICAMENTE con JSON válido siguiendo este schema:
{
  "mode": "investigacion | comentario | precursor | sencillo | referencias | profundo | perla",
  "questionType": "definicion_sencilla | explicacion_basica | razonamiento_espiritual | aplicacion_personal | analisis_multifuente | busqueda_tematica | preparacion_reunion",
  "reasoningLevel": "bajo | medio | alto",
  "summary": "string - respuesta directa en 1-2 párrafos claros",
  "biblicalBasis": [{"reference": "string", "text": "string - explicación breve de este texto", "usedSourceRef": "string - la referencia exacta como aparece en FUENTES VERIFICADAS"}],
  "additionalReferences": [{"source": "precursor | wol | manual", "reference": "string", "note": "string - breve descripción"}],
  "application": "string | null - cómo aplicarlo en la vida cristiana (si aplica)",
  "sourceFindings": [{"type": "string", "reference": "string", "title": "string|null", "url": "string|null", "status": "resolved|unresolved|ambiguous|failed", "notes": "string|null"}],
  "comments": [
    {
      "type": "directo",
      "durationSeconds": 15,
      "variants": [
        { "text": "string - comentario claro y breve, 10-15 segundos", "whyItWorks": "string - por qué este comentario funciona", "usedSourceRefs": ["Juan 17:3", "w13 15/10 pág. 27 párr. 7"] }
      ]
    },
    {
      "type": "natural",
      "durationSeconds": 30,
      "variants": [
        { "text": "string - comentario oral equilibrado, 20-30 segundos", "whyItWorks": "string", "usedSourceRefs": [] }
      ]
    },
    {
      "type": "razonado",
      "durationSeconds": 50,
      "variants": [
        { "text": "string - desarrolla la idea principal con razonamiento, 40-60 segundos", "whyItWorks": "string", "usedSourceRefs": [] }
      ]
    },
    {
      "type": "profundo",
      "durationSeconds": 75,
      "variants": [
        { "text": "string - conecta fuente, razonamiento y aplicación, 60-90 segundos", "whyItWorks": "string", "usedSourceRefs": [] }
      ]
    }
  ],
  "sourceHighlights": [{"sourceReference": "string", "paragraphNumber": number|null, "exactText": "string - fragmento EXACTO copiado del texto de la fuente", "reason": "string - por qué se usó esta frase"}],
  "warnings": ["string"],
  "followUpSuggestions": ["string"],
  "confidenceNote": "string | null - SOLO si mezclaste razonamiento general (no proveniente de una fuente verificada) con contenido de fuentes verificadas. NUNCA la uses para explicar por qué un campo salió vacío (ej. que la fuente no citaba textos bíblicos) — eso no es una falta de confianza, es simplemente el contenido de la fuente. En ese caso deja confidenceNote en null."
}

REGLAS DE GENERACIÓN:
- Genera siempre 4 categorías de comentario: directo, natural, razonado, profundo.
- Para CADA categoría, genera exactamente ${variantCount} variantes dentro de su array "variants" (no 1, no más de ${variantCount}).
- Las variantes de una misma categoría deben ser CLARAMENTE DISTINTAS entre sí: diferente apertura, diferente énfasis o ángulo de razonamiento, diferente forma de conectar la fuente con la aplicación — pero SIN salirse del contexto principal de la pregunta ni contradecir las otras variantes. Todas deben responder la MISMA pregunta con las MISMAS fuentes/citas verificadas, solo con un tejido distinto.
- No repitas la misma frase de apertura ni la misma estructura de oración entre variantes de la misma categoría.
- "directo": 10-15 segundos. Solo 2-3 oraciones.
- "natural": 20-30 segundos. Ideal para reunión.
- "razonado": 40-60 segundos. Explica, conecta, aplica.
- "profundo": 60-90 segundos. Estructura completa.
- Ajusta la profundidad según el tipo de pregunta.
- Para "definicion_sencilla": no fuerces extensión. El profundo puede ser 40s.
- Para "razonamiento_espiritual" o "busqueda_tematica": desarrolla más.
- En "biblicalBasis" incluye los textos bíblicos que usaste con su explicación.
- En "additionalReferences" incluye fuentes del libro de precursores u otras si aplican.
- En "usedSourceRefs" de cada variante incluye SOLO las refs que esa variante realmente usa.
- "confidenceNote": SOLO decláralo si tu respuesta mezcla razonamiento general con fuentes verificadas. Si biblicalBasis o additionalReferences quedan vacíos simplemente porque la fuente no tenía ese contenido, eso NO es motivo para confidenceNote — déjalo en null. No expliques en confidenceNote (ni en ningún otro campo de texto libre) por qué un campo del JSON quedó vacío; los campos vacíos ya son autoexplicativos para el frontend.

No incluyas markdown, bloques de código ni texto fuera del JSON.`;

  return prompt;
}

// ─── OpenAI API call ─────────────────────────────────────

const API_URL = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 120_000; // el razonamiento extendido (reasoning_effort) puede tardar más que una llamada simple
const MAX_RETRIES = 1;

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChoice {
  message: { content: string };
  finish_reason: string;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// Modelos con razonamiento extendido (reasoning_effort) consumen tokens de razonamiento
// internos del MISMO presupuesto que max_completion_tokens, antes de escribir el JSON visible.
// Con muchas referencias/citas largas en un solo mensaje, un presupuesto corto se agotaba
// en el razonamiento y el JSON salía cortado a la mitad (parseo fallido, "se atora").
const MAX_COMPLETION_TOKENS = 8000;

async function callOpenAI(
  messages: OpenAIMessage[],
  config: { apiKey: string; model: string },
  reasoningEffort?: string,
): Promise<{ response: OpenAIResponse; raw: string; truncated: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        response_format: { type: "json_object" },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`OpenAI API error ${res.status}: ${errorBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    const raw = data.choices?.[0]?.message?.content || "";
    const truncated = data.choices?.[0]?.finish_reason === "length";
    return { response: data, raw, truncated };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── Parse response ──────────────────────────────────────

/** Tolera que la IA devuelva "variants" o (por error) el comentario plano de un solo texto. */
function normalizeCommentGroups(raw: unknown): GeneratedCommentGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g: any): GeneratedCommentGroup | null => {
      if (!g || typeof g !== "object") return null;
      const type = g.type || g.level;
      if (!type) return null;
      let variants: CommentVariant[];
      if (Array.isArray(g.variants)) {
        variants = g.variants
          .filter((v: any) => v && typeof v.text === "string" && v.text.trim())
          .map((v: any) => ({
            text: v.text,
            whyItWorks: v.whyItWorks || "",
            usedSourceRefs: Array.isArray(v.usedSourceRefs) ? v.usedSourceRefs : [],
          }));
      } else if (typeof g.text === "string" && g.text.trim()) {
        // Fallback: la IA devolvió el formato plano antiguo por error.
        variants = [{ text: g.text, whyItWorks: g.whyItWorks || "", usedSourceRefs: Array.isArray(g.usedSourceRefs) ? g.usedSourceRefs : [] }];
      } else {
        variants = [];
      }
      if (variants.length === 0) return null;
      return { type, durationSeconds: g.durationSeconds || 30, variants };
    })
    .filter((g): g is GeneratedCommentGroup => g !== null);
}

function parseAssistantResponse(raw: string): AssistantResponse {
  try {
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode || "comentario",
      questionType: parsed.questionType || "explicacion_basica",
      reasoningLevel: parsed.reasoningLevel || "medio",
      summary: parsed.summary || "",
      biblicalBasis: Array.isArray(parsed.biblicalBasis) ? parsed.biblicalBasis : [],
      additionalReferences: Array.isArray(parsed.additionalReferences) ? parsed.additionalReferences : [],
      application: parsed.application || null,
      sourceFindings: Array.isArray(parsed.sourceFindings) ? parsed.sourceFindings : [],
      comments: normalizeCommentGroups(parsed.comments),
      sourceHighlights: Array.isArray(parsed.sourceHighlights) ? parsed.sourceHighlights : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      followUpSuggestions: Array.isArray(parsed.followUpSuggestions) ? parsed.followUpSuggestions : [],
      confidenceNote: parsed.confidenceNote || null,
    };
  } catch {
    throw new Error("La IA devolvió un formato inválido");
  }
}

// ─── Main entry point ────────────────────────────────────

export interface GenerateOptions {
  userMessage: string;
  resolvedRefs: ResolvedReference[];
  options: ResearchChatOptions;
  systemPrompt: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  unresolvedExplicitRefs?: Array<{ raw: string; type: string; status: string; notes?: string }>;
  /** When true, AI must ONLY use the provided verified sources. No external Bible texts allowed. */
  explicitReferenceOnlyMode?: boolean;
  /** "minimal" | "low" | "medium" | "high" | "xhigh" — viene del perfil (ResearchProfile.reasoningEffort). Sin valor = sin razonamiento extendido. */
  reasoningEffort?: string | null;
  /** Cuántas variantes generar por categoría de comentario (directo/natural/razonado/profundo). Default 2. */
  variantCount?: number;
}

export interface GenerateResult {
  response: AssistantResponse;
  metadata: AiRunMetadata;
}

/**
 * Genera respuesta del asistente de investigación.
 * Retry automático 1 vez si falla el parseo.
 */
export async function generateResearchResponse(opts: GenerateOptions): Promise<GenerateResult> {
  const config = getConfig();

  const baseMessages: OpenAIMessage[] = [
    { role: "system", content: buildSystemPrompt(opts.systemPrompt) },
  ];

  // Agregar historial de conversación (últimos 6 mensajes max para no saturar tokens)
  if (opts.conversationHistory?.length) {
    const history = opts.conversationHistory.slice(-6);
    for (const msg of history) {
      baseMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const requestedVariantCount = opts.variantCount ?? DEFAULT_VARIANT_COUNT;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Si el intento anterior se truncó por límite de tokens (muchas referencias/citas largas
    // en un solo mensaje), reintenta pidiendo menos variantes por categoría para garantizar
    // una respuesta completa y válida en vez de fallar del todo.
    const effectiveVariantCount = attempt === 0 ? requestedVariantCount : Math.max(1, requestedVariantCount - attempt);
    const messages: OpenAIMessage[] = [
      ...baseMessages,
      {
        role: "user",
        content: buildUserPrompt(opts.userMessage, opts.resolvedRefs, opts.options, opts.unresolvedExplicitRefs, opts.explicitReferenceOnlyMode, effectiveVariantCount),
      },
    ];

    try {
      const { response, raw, truncated } = await callOpenAI(messages, config, opts.reasoningEffort ?? undefined);
      if (truncated) {
        throw new Error("La IA devolvió un formato inválido (respuesta truncada por límite de tokens)");
      }
      const parsed = parseAssistantResponse(raw);

      return {
        response: parsed,
        metadata: {
          model: config.model,
          promptVersion: "system_prompt_v2",
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          status: "success",
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES && lastError.message.includes("formato inválido")) {
        continue;
      }
    }
  }

  return {
    response: {
      mode: "comentario",
      questionType: "unknown",
      reasoningLevel: "unknown",
      summary: "",
      biblicalBasis: [],
      additionalReferences: [],
      application: null,
      sourceFindings: [],
      comments: [],
      sourceHighlights: [],
      warnings: [lastError?.message || "Error desconocido al generar respuesta"],
      followUpSuggestions: ["Intenta de nuevo"],
      confidenceNote: null,
    },
    metadata: {
      model: config.model,
      promptVersion: "system_prompt_v2",
      inputTokens: 0,
      outputTokens: 0,
      status: "failed",
      error: lastError?.message,
    },
  };
}

// ─── Generar más variantes de una sola categoría ─────────
//
// Llamada liviana: no repite todo el pipeline (mode/summary/biblicalBasis/etc.),
// solo pide N variantes nuevas de una categoría de comentario ya existente,
// manteniendo el mismo contexto/fuentes de la pregunta original y evitando
// repetir el enfoque de las variantes que ya existen.

export interface GenerateMoreVariantsOptions {
  commentType: "directo" | "natural" | "razonado" | "profundo";
  count: number;
  userMessage: string;
  resolvedRefs: ResolvedReference[];
  existingVariants: CommentVariant[];
  systemPrompt: string;
  reasoningEffort?: string | null;
}

export interface GenerateMoreVariantsResult {
  variants: CommentVariant[];
  metadata: AiRunMetadata;
}

const COMMENT_TYPE_GUIDANCE: Record<string, string> = {
  directo: '"directo": 10-15 segundos, solo 2-3 oraciones.',
  natural: '"natural": 20-30 segundos, ideal para reunión.',
  razonado: '"razonado": 40-60 segundos, explica, conecta, aplica.',
  profundo: '"profundo": 60-90 segundos, estructura completa.',
};

function buildMoreVariantsPrompt(opts: GenerateMoreVariantsOptions): string {
  let prompt = "";

  const verifiedSources = opts.resolvedRefs.filter(
    (ref) => ref.status === "resolved" && (ref.excerpt || (ref.type === "bible" && ref.extractedContent && ref.extractedContent.length > 0))
  );

  if (verifiedSources.length > 0) {
    prompt += "FUENTES VERIFICADAS DE LA PREGUNTA ORIGINAL — ÚNICA BASE PERMITIDA:\n";
    for (const ref of verifiedSources) {
      prompt += `- [${ref.type}] ${ref.raw}`;
      if (ref.extractedContent && ref.extractedContent.length > 0) {
        prompt += "\n  Contenido extraído por párrafo:";
        for (const p of ref.extractedContent) prompt += `\n    ${p.label}: ${p.text}`;
      } else if (ref.excerpt) {
        prompt += `\n  Contenido extraído: ${ref.excerpt}`;
      }
      prompt += "\n";
    }
    prompt += "\n";
  }

  prompt += `PREGUNTA / CONTEXTO ORIGINAL:\n${opts.userMessage}\n\n`;

  prompt += `Ya existen estas variantes del comentario tipo "${opts.commentType}" para esta misma pregunta — NO las repitas ni reuses su apertura o estructura:\n`;
  for (const v of opts.existingVariants) {
    prompt += `- "${v.text}"\n`;
  }
  prompt += "\n";

  prompt += `TAREA: Genera exactamente ${opts.count} variantes NUEVAS y DISTINTAS del comentario tipo "${opts.commentType}" para la MISMA pregunta y las MISMAS fuentes verificadas de arriba.
- No te salgas del contexto principal de la pregunta.
- No inventes contenido que no esté en las fuentes verificadas de arriba.
- Cada variante nueva debe tener un ángulo, apertura o énfasis distinto entre sí y distinto de las variantes ya existentes.
- ${COMMENT_TYPE_GUIDANCE[opts.commentType] || ""}

Responde ÚNICAMENTE con JSON válido con este schema exacto:
{
  "variants": [
    { "text": "string", "whyItWorks": "string - por qué este comentario funciona", "usedSourceRefs": ["string"] }
  ]
}
No incluyas markdown, bloques de código ni texto fuera del JSON.`;

  return prompt;
}

function parseMoreVariantsResponse(raw: string): CommentVariant[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.variants)) return [];
    return parsed.variants
      .filter((v: any) => v && typeof v.text === "string" && v.text.trim())
      .map((v: any) => ({
        text: v.text,
        whyItWorks: v.whyItWorks || "",
        usedSourceRefs: Array.isArray(v.usedSourceRefs) ? v.usedSourceRefs : [],
      }));
  } catch {
    throw new Error("La IA devolvió un formato inválido");
  }
}

export async function generateMoreCommentVariants(opts: GenerateMoreVariantsOptions): Promise<GenerateMoreVariantsResult> {
  const config = getConfig();

  const messages: OpenAIMessage[] = [
    { role: "system", content: buildSystemPrompt(opts.systemPrompt) },
    { role: "user", content: buildMoreVariantsPrompt(opts) },
  ];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { response, raw, truncated } = await callOpenAI(messages, config, opts.reasoningEffort ?? undefined);
      if (truncated) throw new Error("La IA devolvió un formato inválido (respuesta truncada por límite de tokens)");
      const variants = parseMoreVariantsResponse(raw);
      return {
        variants,
        metadata: {
          model: config.model,
          promptVersion: "system_prompt_v2",
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          status: "success",
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES && lastError.message.includes("formato inválido")) {
        continue;
      }
    }
  }

  return {
    variants: [],
    metadata: {
      model: config.model,
      promptVersion: "system_prompt_v2",
      inputTokens: 0,
      outputTokens: 0,
      status: "failed",
      error: lastError?.message,
    },
  };
}
