import { prisma } from "@jw-reminders/database";
import { generateMoreCommentVariants, type CommentVariant } from "../../../../services/research-chat/openai.service.js";
import { resolveSystemPrompt } from "../../../../services/research-chat/prompt-resolver.service.js";

export interface GenerateMoreVariantsInput {
  userId: string;
  sessionId: string;
  messageId: string;
  commentType: string;
  count?: number;
}

const DEFAULT_MORE_COUNT = 2;

export async function generateMoreVariants(input: GenerateMoreVariantsInput) {
  const { userId, sessionId, messageId, commentType, count = DEFAULT_MORE_COUNT } = input;

  const session = await prisma.researchChatSession.findFirst({
    where: { id: sessionId, userId },
    include: { profile: true },
  });
  if (!session) throw new Error("Sesión no encontrada");

  const message = await prisma.researchChatMessage.findFirst({
    where: { id: messageId, sessionId, role: "assistant" },
  });
  if (!message || !message.structured) throw new Error("Mensaje no encontrado");

  const structured = message.structured as any;
  const comments: any[] = Array.isArray(structured.comments) ? structured.comments : [];
  const groupIdx = comments.findIndex((c: any) => (c.type || c.level) === commentType);
  if (groupIdx === -1) throw new Error(`No existe la categoría de comentario "${commentType}" en este mensaje`);

  const group = comments[groupIdx];
  const existingVariants: CommentVariant[] = Array.isArray(group.variants)
    ? group.variants
    : typeof group.text === "string"
    ? [{ text: group.text, whyItWorks: group.whyItWorks || "", usedSourceRefs: group.usedSourceRefs || [] }]
    : [];

  // Encuentra la pregunta original del usuario que precede a este mensaje del asistente.
  const sessionMessages = await prisma.researchChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  const targetIdx = sessionMessages.findIndex((m) => m.id === messageId);
  const precedingUserMsg = targetIdx > 0
    ? [...sessionMessages.slice(0, targetIdx)].reverse().find((m) => m.role === "user")
    : null;

  const contextParts: string[] = [];
  if (precedingUserMsg) contextParts.push(precedingUserMsg.content);
  if (structured.summary) contextParts.push(`Respuesta ya generada (resumen): ${structured.summary}`);
  const userMessage = contextParts.join("\n\n") || message.content;

  const existingRefs = await prisma.researchReference.findMany({ where: { sessionId } });
  const resolvedRefs = existingRefs.map((r) => {
    const norm = r.normalized as any;
    return {
      type: r.type,
      raw: r.raw,
      status: r.status as any,
      title: r.title || undefined,
      url: r.url || undefined,
      excerpt: r.excerpt || undefined,
      extractedContent: norm?.extractedContent,
    };
  });

  const systemPrompt = await resolveSystemPrompt(session.profile.promptRuleName);

  const { variants: newVariants, metadata } = await generateMoreCommentVariants({
    commentType: commentType as any,
    count,
    userMessage,
    resolvedRefs,
    existingVariants,
    systemPrompt,
    reasoningEffort: session.profile.reasoningEffort,
  });

  if (newVariants.length === 0) {
    throw new Error(metadata.error || "No se pudieron generar más variantes");
  }

  const updatedVariants = [...existingVariants, ...newVariants];
  const updatedComments = comments.map((c: any, i: number) =>
    i === groupIdx ? { type: group.type || group.level, durationSeconds: group.durationSeconds || 30, variants: updatedVariants } : c
  );
  const updatedStructured = { ...structured, comments: updatedComments };

  await prisma.researchChatMessage.update({
    where: { id: messageId },
    data: { structured: updatedStructured },
  });

  await prisma.researchAiRun.create({
    data: {
      sessionId,
      messageId,
      model: metadata.model,
      promptVersion: metadata.promptVersion,
      inputTokens: metadata.inputTokens,
      outputTokens: metadata.outputTokens,
      status: metadata.status,
      error: metadata.error,
    },
  });

  return {
    messageId,
    commentType,
    variants: updatedVariants,
  };
}
