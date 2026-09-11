/**
 * Operación: Enviar mensaje de investigación
 *
 * Orquesta toda la lógica para procesar una pregunta:
 * - Crear o recuperar sesión
 * - Resolver referencias
 * - Búsqueda temática
 * - Source-gating
 * - Generación de respuesta via OpenAI
 * - Validación de fuentes
 * - Persistencia
 */

import { prisma } from "@jw-reminders/database";
import {
  parseAllReferences,
  detectAIGeneratedText,
  sanitizeAIInjectedSource,
  parseCompoundQuestion,
  determineSourceStatus,
  validateResponseCoverage,
} from "@jw-reminders/shared";
import { resolveReferences } from "../../../../services/research-chat/wol-resolver.service.js";
import { generateResearchResponse, type ResearchChatOptions } from "../../../../services/research-chat/openai.service.js";
import { matchPrecursorQuestion } from "../../../../services/research-chat/precursor-matcher.service.js";
import { searchByTopic, type TopicSearchResult } from "../../../../services/research-chat/topic-search.service.js";
import { validateSources } from "../../../../services/research-chat/source-validator.service.js";
import { resolveSystemPrompt } from "../../../../services/research-chat/prompt-resolver.service.js";

export interface SendResearchMessageInput {
  userId: string;
  sessionId?: string;
  message: string;
  options?: ResearchChatOptions;
  profileId?: string;
}

export async function sendResearchMessage(input: SendResearchMessageInput) {
  const { userId, sessionId, message, options = {}, profileId } = input;

  // Get or create session
  let session;
  if (sessionId) {
    session = await prisma.researchChatSession.findFirst({
      where: { id: sessionId, userId },
      include: { profile: true },
    });
    if (!session) throw new Error("Sesión no encontrada");
  } else {
    const title = message.slice(0, 60).replace(/\n/g, " ").trim() + (message.length > 60 ? "…" : "");
    const profileExists = profileId
      ? await prisma.researchProfile.findFirst({ where: { id: profileId, isActive: true } })
      : null;
    session = await prisma.researchChatSession.create({
      data: { userId, title, profileId: profileExists?.id ?? "general" },
      include: { profile: true },
    });
  }

  // Sesiones creadas por adelantado (flujo de perfiles) no tienen título aún;
  // se deriva del primer mensaje real, igual que en la creación implícita.
  if (!session.title) {
    const derivedTitle = message.slice(0, 60).replace(/\n/g, " ").trim() + (message.length > 60 ? "…" : "");
    session = await prisma.researchChatSession.update({
      where: { id: session.id },
      data: { title: derivedTitle },
      include: { profile: true },
    });
  }

  const systemPrompt = await resolveSystemPrompt(session.profile.promptRuleName);
  const profileOptions: ResearchChatOptions = {
    outputType: options.outputType ?? (session.profile.defaultOutputType as ResearchChatOptions["outputType"]) ?? undefined,
    level: options.level ?? (session.profile.defaultLevel as ResearchChatOptions["level"]) ?? undefined,
    duration: options.duration ?? (session.profile.defaultDuration as ResearchChatOptions["duration"]) ?? undefined,
    language: options.language,
  };

  // Save user message
  const userMsg = await prisma.researchChatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: message,
    },
  });

  // Parse references
  const { allRefs } = parseAllReferences(message);

  // Parse compound question
  const parsedQuestion = parseCompoundQuestion(message);

  // Match against Precursor Study Index
  let matchedStudyContext: any = null;
  if (session.profile.forcePrecursorMatch || process.env.PRECURSOR_STUDY_INDEX_ENABLED === "true") {
    const precursorMatch = matchPrecursorQuestion(message);
    if (precursorMatch.matched && precursorMatch.confidence >= 0.60) {
      matchedStudyContext = {
        confidence: precursorMatch.confidence,
        matchStrategy: precursorMatch.matchStrategy,
        lesson: precursorMatch.lesson?.title,
        lessonKey: precursorMatch.lesson?.lessonKey,
        day: precursorMatch.lesson?.day,
        extract: precursorMatch.matchedExtract?.caption,
        articleTitle: precursorMatch.matchedExtract?.articleTitle,
        userQuestion: message.replace(/\([^)]*\)/g, "").replace(/https?:\/\/\S+/g, "").trim(),
        source: "pt14_S.index.json",
      };
    }
  }

  // Resolve references
  const resolvedRefs = await resolveReferences(allRefs, message);

  // Save references to DB
  for (const ref of resolvedRefs) {
    await prisma.researchReference.create({
      data: {
        sessionId: session.id,
        messageId: userMsg.id,
        type: ref.type,
        raw: ref.raw,
        status: ref.status,
        title: ref.title,
        url: ref.url,
        excerpt: ref.excerpt,
        normalized: ref as any,
      },
    });
  }

  // EXPLICIT_REFERENCE_ONLY mode detection
  const hasExplicitRefs = allRefs.length > 0;
  const isExplicitReferenceOnlyMode = hasExplicitRefs;

  // Topic search: ONLY when no explicit refs provided
  let topicSearchResults: TopicSearchResult | null = null;
  const userTextOnly = message.replace(/\(.*?\)/g, "").replace(/https?:\/\/\S+/g, "").trim();

  if (!isExplicitReferenceOnlyMode && userTextOnly.length > 10) {
    const fewExplicitRefs = resolvedRefs.filter((s) => s.status === "resolved").length < 2;
    if (fewExplicitRefs) {
      topicSearchResults = searchByTopic(userTextOnly);
      if (topicSearchResults.bibleResults.length > 0) {
        const { resolveFromLocal } = await import("../../../../services/research-chat/bible-local-resolver.service.js");
        for (const br of topicSearchResults.bibleResults.slice(0, 8)) {
          const alreadyResolved = resolvedRefs.some((r) => r.raw === br.reference);
          if (!alreadyResolved && br.metadata.book && br.metadata.chapter && br.metadata.verse) {
            const local = resolveFromLocal(
              br.metadata.book,
              br.metadata.chapter,
              String(br.metadata.verse),
              br.reference,
            );
            if (local.status === "resolved" && local.extractedContent.length > 0) {
              resolvedRefs.push({
                type: "bible",
                raw: br.reference,
                status: "resolved",
                sourceOrigin: "local_bible",
                url: local.url,
                urlType: "direct",
                title: br.reference,
                publication: "Traducción del Nuevo Mundo",
                excerpt: local.extractedContent.map((v: any) => v.text).join(" ").slice(0, 400),
                extractedContent: local.extractedContent.map((v: any) => ({
                  label: v.label,
                  paragraphNumber: v.paragraphNumber,
                  text: v.text,
                })),
                notes: "Versículo encontrado por búsqueda temática local.",
              } as any);
            }
          }
        }
      }
    }
  }

  // Source-gating: only call AI if we have usable content
  const hasUsableUserText = Boolean(userTextOnly && userTextOnly.length > 100);
  const hasResolvedWolSource = resolvedRefs.some(
    (s) => s.type === "wol" && s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 40
  );
  const hasResolvedWolLink = resolvedRefs.some(
    (s) => s.type === "wol_link" && s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 40
  );
  const hasResolvedBibleSource = resolvedRefs.some(
    (s) => s.type === "bible" && s.status === "resolved" && s.extractedContent && s.extractedContent.length > 0 && s.extractedContent.some((b: any) => b.text && b.text.trim().length > 0)
  );
  const hasAnyUsableSource = hasUsableUserText || hasResolvedWolSource || hasResolvedWolLink || hasResolvedBibleSource || (topicSearchResults && topicSearchResults.totalResults > 0);

  const usedSources = resolvedRefs.filter(
    (s) => (s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 10) ||
           (s.type === "bible" && s.status === "resolved" && s.extractedContent && s.extractedContent.length > 0)
  );

  const unresolvedExplicitRefs = resolvedRefs.filter(
    (s) => !(
      (s.status === "resolved" && s.excerpt && s.excerpt.trim().length > 10) ||
      (s.type === "bible" && s.status === "resolved" && s.extractedContent && s.extractedContent.length > 0)
    )
  );

  // EXPLICIT_REFERENCE_ONLY: block AI if ALL explicit refs failed
  if (isExplicitReferenceOnlyMode && usedSources.length === 0) {
    const blockedResponse = {
      summary: null,
      mode: "EXPLICIT_REFERENCE_ONLY",
      canGenerate: false,
      usedSources: [],
      unresolvedExplicitRefs: unresolvedExplicitRefs.map((s) => ({
        reference: s.raw,
        type: s.type,
        status: s.status,
        reason: s.status === "invalid_reference"
          ? (s.notes || "Referencia con datos inválidos (fecha, página o párrafo fuera de rango)")
          : s.status === "unresolved"
          ? "No se pudo extraer contenido específico de esta referencia"
          : s.status === "failed"
          ? "Error al intentar resolver la referencia"
          : "No se pudo verificar el contenido de esta referencia",
        url: s.url,
        explicit: true,
      })),
      detectedButUnusedSources: [],
      sourceFindings: resolvedRefs.map((r) => ({
        type: r.type,
        reference: r.raw,
        title: r.title || null,
        url: r.url || null,
        status: r.status,
        notes: r.notes || null,
      })),
      comments: [],
      sourceVerificationStatus: "UNVERIFIED" as const,
      warnings: [
        `No pude resolver la(s) referencia(s) explícita(s) en la base local: ${unresolvedExplicitRefs.map(s => s.raw).join("; ")}. No generaré comentario hasta que la fuente principal esté verificada.`,
      ],
      followUpSuggestions: [
        "Pegar el texto de la referencia",
        "Pegar el link directo del artículo desde JW.org",
        "Intentar resolver la referencia otra vez",
      ],
    };

    const assistantMsg = await prisma.researchChatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: blockedResponse.warnings[0],
        structured: blockedResponse as any,
      },
    });

    await prisma.researchChatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    return {
      sessionId: session.id,
      messageId: assistantMsg.id,
      assistantMessage: { ...blockedResponse, matchedStudyContext },
    };
  }

  // Source-gating for non-explicit-reference mode
  const shouldCallAI = hasAnyUsableSource || hasExplicitRefs;

  if (!shouldCallAI) {
    const gatedResponse = {
      summary: null,
      usedSources: [],
      unresolvedExplicitRefs: unresolvedExplicitRefs.map((s) => ({
        reference: s.raw,
        type: s.type,
        status: s.status,
        reason: s.status === "invalid_reference"
          ? (s.notes || "Referencia con datos inválidos (fecha, página o párrafo fuera de rango)")
          : s.status === "unresolved"
          ? "No se pudo extraer contenido específico de esta referencia"
          : s.status === "failed"
          ? "Error al intentar resolver la referencia"
          : "No se pudo verificar el contenido de esta referencia",
        url: s.url,
        explicit: true,
      })),
      detectedButUnusedSources: [],
      sourceFindings: resolvedRefs.map((r) => ({
        type: r.type,
        reference: r.raw,
        title: r.title || null,
        url: r.url || null,
        status: r.status,
        notes: r.notes || null,
      })),
      comments: [],
      warnings: [
        "Detecté referencias, pero no pude obtener contenido real. Para evitar inventar información, pega el texto de la fuente o intenta resolver la referencia de nuevo.",
      ],
      followUpSuggestions: [
        "Pegar el texto de la referencia",
        "Intentar resolver la referencia otra vez",
        "Abrir la fuente en JW.org",
      ],
    };

    const assistantMsg = await prisma.researchChatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: gatedResponse.warnings[0],
        structured: gatedResponse as any,
      },
    });

    await prisma.researchChatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    return {
      sessionId: session.id,
      messageId: assistantMsg.id,
      assistantMessage: { ...gatedResponse, matchedStudyContext },
    };
  }

  // Get conversation history
  const previousMessages = await prisma.researchChatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  const conversationHistory = previousMessages
    .filter((m) => m.role !== "system" && m.id !== userMsg.id)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.role === "assistant" && m.structured
        ? JSON.stringify(m.structured)
        : m.content,
    }));

  const sourcesForAi = usedSources;

  // Build enriched message for AI
  let aiUserMessage = message;

  if (parsedQuestion.questionCount > 1 || parsedQuestion.requiresPersonalApplication) {
    let questionContext = "\n\n[ESTRUCTURA DE LA PREGUNTA — OBLIGATORIO RESPONDER TODAS]\n";
    questionContext += `Se detectaron ${parsedQuestion.questionCount} pregunta(s):\n`;
    for (const q of parsedQuestion.subQuestions) {
      questionContext += `  ${q.id}. [${q.intent}] ${q.text}\n`;
    }
    if (parsedQuestion.requiresPersonalApplication) {
      questionContext += "\nIMPORTANTE: La pregunta requiere aplicación personal. Usa lenguaje en primera persona (\"En mi caso...\", \"He pensado...\", \"Puedo aplicarlo...\").\n";
    }
    questionContext += "OBLIGACIÓN: Tu respuesta DEBE cubrir TODAS las preguntas listadas arriba. No omitas ninguna.\n";
    aiUserMessage += questionContext;
  }

  if (matchedStudyContext) {
    aiUserMessage = `[CONTEXTO DEL LIBRO DE LOS PRECURSORES]
Lección: ${matchedStudyContext.lesson}
Día: ${matchedStudyContext.day}
Extracto del índice: ${matchedStudyContext.extract}
Confianza: ${Math.round(matchedStudyContext.confidence * 100)}%
Estrategia de coincidencia: ${matchedStudyContext.matchStrategy}

[PREGUNTA DEL USUARIO]
${message}`;
  }

  if (topicSearchResults && topicSearchResults.totalResults > 0) {
    let topicContext = "\n\n[EVIDENCIA DE BÚSQUEDA TEMÁTICA]\n";
    topicContext += `Términos buscados: ${topicSearchResults.expandedTerms.slice(0, 15).join(", ")}\n`;
    if (topicSearchResults.precursorResults.length > 0) {
      topicContext += "Resultados del libro de precursores:\n";
      for (const r of topicSearchResults.precursorResults.slice(0, 5)) {
        topicContext += `  - ${r.metadata.lesson} | ${r.text} (relevancia: ${Math.round(r.score * 100)}%)\n`;
      }
    }
    topicContext += `\nNota: Los versículos encontrados por búsqueda temática ya fueron incluidos en FUENTES VERIFICADAS arriba.\n`;
    aiUserMessage += topicContext;
  }

  // Generate AI response
  const { response: aiResponse, metadata } = await generateResearchResponse({
    userMessage: aiUserMessage,
    resolvedRefs: sourcesForAi,
    options: profileOptions,
    systemPrompt,
    conversationHistory,
    unresolvedExplicitRefs: unresolvedExplicitRefs.map((s) => ({
      raw: s.raw, type: s.type, status: s.status, notes: s.notes,
    })),
    explicitReferenceOnlyMode: isExplicitReferenceOnlyMode,
    reasoningEffort: session.profile.reasoningEffort,
  });

  // Validate sourceHighlights
  const validatedHighlights = (aiResponse.sourceHighlights || []).filter((h) => {
    const source = usedSources.find((s) => s.raw === h.sourceReference);
    if (!source) return false;
    if (source.extractedContent && source.extractedContent.length > 0) {
      if (h.paragraphNumber) {
        const para = source.extractedContent.find((p) => p.paragraphNumber === h.paragraphNumber);
        return para ? para.text.includes(h.exactText) : false;
      }
      return source.extractedContent.some((p) => p.text.includes(h.exactText));
    }
    return source.excerpt ? source.excerpt.includes(h.exactText) : false;
  });

  // Build enriched sources
  const enrichedUsedSources = usedSources.map((s) => {
    const highlightsForSource = validatedHighlights.filter((h) => h.sourceReference === s.raw);
    const extractedContent = (s.extractedContent || []).map((p) => ({
      label: p.label,
      paragraphNumber: p.paragraphNumber,
      text: p.text,
      highlights: highlightsForSource
        .filter((h) => !h.paragraphNumber || h.paragraphNumber === p.paragraphNumber)
        .filter((h) => p.text.includes(h.exactText))
        .map((h) => ({ text: h.exactText, reason: h.reason })),
    }));

    return {
      reference: s.raw,
      type: s.type,
      status: s.status,
      sourceOrigin: s.sourceOrigin || null,
      title: s.title || null,
      publication: s.publication || null,
      url: s.url || null,
      urlType: s.urlType || null,
      extractedContent,
    };
  });

  const validUsedSources = enrichedUsedSources.filter((s: any) => {
    if (s.type === "bible" && (!s.extractedContent || s.extractedContent.length === 0)) {
      unresolvedExplicitRefs.push({
        raw: s.reference, type: s.type, status: "extraction_failed",
        notes: "La cita bíblica fue detectada, pero no se pudo cargar el texto local.",
        url: s.url,
      } as any);
      return false;
    }
    return true;
  });

  const enrichedResponse = {
    ...aiResponse,
    sourceHighlights: validatedHighlights,
    usedSources: validUsedSources,
    unresolvedExplicitRefs: unresolvedExplicitRefs.map((s) => ({
      reference: s.raw,
      type: s.type,
      status: s.status,
      explicit: true,
      reason: s.status === "invalid_reference"
        ? (s.notes || "Referencia con datos inválidos (fecha, página o párrafo fuera de rango)")
        : s.status === "unresolved"
        ? "No se encontró contenido local verificable para esta referencia"
        : s.status === "failed"
        ? "Error al intentar resolver la referencia"
        : "No se pudo verificar el contenido de esta referencia",
      url: s.url,
    })),
    detectedButUnusedSources: [] as any[],
  };

  if (enrichedResponse.additionalReferences) {
    enrichedResponse.additionalReferences = (enrichedResponse.additionalReferences || []).map((ref: any) => ({
      ...ref,
      _aiGenerated: true,
    }));
  }

  if ((aiResponse as any).verifiedSources) {
    delete (enrichedResponse as any).verifiedSources;
  }

  if (isExplicitReferenceOnlyMode) {
    const allSourceText = usedSources
      .map((s) => (s.extractedContent || []).map((p: any) => p.text).join(" "))
      .join(" ")
      .toLowerCase();

    if (enrichedResponse.biblicalBasis && enrichedResponse.biblicalBasis.length > 0) {
      enrichedResponse.biblicalBasis = enrichedResponse.biblicalBasis.filter((b: any) => {
        const ref = (b.reference || "").toLowerCase();
        return allSourceText.includes(ref) ||
          allSourceText.includes(ref.replace(/\s+/g, " ")) ||
          (b.usedSourceRef && usedSources.some((s) => s.raw === b.usedSourceRef));
      });
    }

    enrichedResponse.additionalReferences = [];
  }

  const { validSources: finalUsedSources, invalidSources } = validateSources(enrichedResponse.usedSources);
  enrichedResponse.usedSources = finalUsedSources as any;
  for (const inv of invalidSources) {
    enrichedResponse.unresolvedExplicitRefs.push({
      reference: inv.reference,
      type: inv.type,
      status: "failed" as any,
      explicit: true,
      reason: `Referencia no verificada: ${inv.issue}`,
      url: undefined,
    } as any);
  }

  const storedResponse = {
    ...enrichedResponse,
    matchedStudyContext,
    usedSources: enrichedResponse.usedSources.map((s: any) => ({
      ...s,
      extractedContent: (s.extractedContent || []).map((p: any) => {
        if (s.type === "bible") {
          return {
            label: p.label,
            paragraphNumber: p.paragraphNumber,
            text: p.text,
            textLength: p.text.length,
            highlights: p.highlights,
          };
        }
        return {
          label: p.label,
          paragraphNumber: p.paragraphNumber,
          textPreview: p.text.slice(0, 100) + (p.text.length > 100 ? "…" : ""),
          textLength: p.text.length,
          highlights: p.highlights,
        };
      }),
    })),
  };

  const assistantMsg = await prisma.researchChatMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: enrichedResponse.summary || "Respuesta generada",
      structured: storedResponse as any,
    },
  });

  await prisma.researchAiRun.create({
    data: {
      sessionId: session.id,
      messageId: assistantMsg.id,
      model: metadata.model,
      promptVersion: metadata.promptVersion,
      inputTokens: metadata.inputTokens,
      outputTokens: metadata.outputTokens,
      status: metadata.status,
      error: metadata.error,
    },
  });

  await prisma.researchChatSession.update({
    where: { id: session.id },
    data: { updatedAt: new Date() },
  });

  const resolvedExplicitCount = enrichedResponse.usedSources?.length || 0;
  const unresolvedExplicitCount = enrichedResponse.unresolvedExplicitRefs?.length || 0;
  const totalExplicitRefCount = Math.max(allRefs.length, parsedQuestion.explicitReferences.length);
  const sourceVerificationStatus = determineSourceStatus(
    totalExplicitRefCount,
    resolvedExplicitCount,
    unresolvedExplicitCount,
  );

  const responseValidation = validateResponseCoverage(
    parsedQuestion,
    enrichedResponse.summary || enrichedResponse.comments?.[0]?.variants?.[0]?.text || "",
    sourceVerificationStatus,
    resolvedExplicitCount,
    unresolvedExplicitCount,
  );

  return {
    sessionId: session.id,
    messageId: assistantMsg.id,
    assistantMessage: {
      ...enrichedResponse,
      matchedStudyContext,
      parsedQuestion: {
        questionCount: parsedQuestion.questionCount,
        subQuestions: parsedQuestion.subQuestions,
        requiresPersonalApplication: parsedQuestion.requiresPersonalApplication,
      },
      sourceVerificationStatus,
      responseValidation: responseValidation.passed ? undefined : responseValidation,
    },
  };
}
