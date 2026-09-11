import { prisma } from "@jw-reminders/database";
import { PROTECTED_PROMPTS, PROTECTED_SYSTEM_PROMPT } from "./protected-prompts.js";

/** Resuelve el system prompt activo para un perfil, con fallback protegido. */
export async function resolveSystemPrompt(promptRuleName: string): Promise<string> {
  const rule = await prisma.researchPromptRule.findFirst({
    where: { name: promptRuleName, isActive: true },
    orderBy: { version: "desc" },
  });
  return rule?.content || PROTECTED_PROMPTS[promptRuleName] || PROTECTED_SYSTEM_PROMPT;
}
