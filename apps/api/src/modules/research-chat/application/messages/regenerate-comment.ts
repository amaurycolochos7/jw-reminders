import { prisma } from "@jw-reminders/database";
import { generateResearchResponse, type ResearchChatOptions } from "../../../../services/research-chat/openai.service.js";
import { resolveSystemPrompt } from "../../../../services/research-chat/prompt-resolver.service.js";

export interface RegenerateCommentInput {
  userId: string;
  sessionId: string;
  messageId?: string;
  instruction: string;
}

export async function regenerateComment(input: RegenerateCommentInput) {
  const { userId, sessionId, messageId, instruction } = input;

  // Verify session ownership
  const session = await prisma.researchChatSession.findFirst({
    where: { id: sessionId, userId },
    include: { profile: true },
  });
  if (!session) throw new Error("Sesión no encontrada");

  const systemPrompt = await resolveSystemPrompt(session.profile.promptRuleName);

  // Get the original message context
  const originalMsg = messageId
    ? await prisma.researchChatMessage.findFirst({
        where: { id: messageId, sessionId },
      })
    : null;

  // Get existing references for this session
  const existingRefs = await prisma.researchReference.findMany({
    where: { sessionId },
  });

  const resolvedRefs = existingRefs.map((r) => ({
    type: r.type,
    raw: r.raw,
    status: r.status as any,
    title: r.title || undefined,
    url: r.url || undefined,
    excerpt: r.excerpt || undefined,
  }));

  // Build the regeneration message
  const contextMessage = originalMsg?.content || "";
  const fullMessage = `Contexto previo: ${contextMessage}\n\nInstrucción del usuario: ${instruction}`;

  const { response: aiResponse, metadata } = await generateResearchResponse({
    userMessage: fullMessage,
    resolvedRefs,
    options: { outputType: "comments", level: "mixed", duration: "mixed" },
    systemPrompt,
    reasoningEffort: session.profile.reasoningEffort,
  });

  // Save as new messages
  await prisma.researchChatMessage.create({
    data: { sessionId, role: "user", content: instruction },
  });

  const assistantMsg = await prisma.researchChatMessage.create({
    data: {
      sessionId,
      role: "assistant",
      content: aiResponse.summary || "Respuesta regenerada",
      structured: aiResponse as any,
    },
  });

  await prisma.researchAiRun.create({
    data: {
      sessionId,
      messageId: assistantMsg.id,
      model: metadata.model,
      promptVersion: metadata.promptVersion,
      inputTokens: metadata.inputTokens,
      outputTokens: metadata.outputTokens,
      status: metadata.status,
      error: metadata.error,
    },
  });

  return {
    sessionId,
    messageId: assistantMsg.id,
    assistantMessage: aiResponse,
  };
}
