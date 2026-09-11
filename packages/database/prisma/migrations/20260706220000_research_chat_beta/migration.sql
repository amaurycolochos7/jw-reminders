-- Research Chat Beta Module

CREATE TABLE "ResearchChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchChatSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchReference" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT,
    "type" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "normalized" JSONB,
    "status" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "excerpt" TEXT,
    "sourceMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchAiRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchAiRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchPromptRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchPromptRule_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "ResearchChatSession_userId_idx" ON "ResearchChatSession"("userId");
CREATE INDEX "ResearchChatMessage_sessionId_idx" ON "ResearchChatMessage"("sessionId");
CREATE INDEX "ResearchReference_sessionId_idx" ON "ResearchReference"("sessionId");
CREATE INDEX "ResearchReference_messageId_idx" ON "ResearchReference"("messageId");
CREATE INDEX "ResearchAiRun_sessionId_idx" ON "ResearchAiRun"("sessionId");
CREATE UNIQUE INDEX "ResearchPromptRule_name_version_key" ON "ResearchPromptRule"("name", "version");

-- Foreign Keys
ALTER TABLE "ResearchChatMessage" ADD CONSTRAINT "ResearchChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchReference" ADD CONSTRAINT "ResearchReference_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchReference" ADD CONSTRAINT "ResearchReference_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ResearchChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchAiRun" ADD CONSTRAINT "ResearchAiRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchAiRun" ADD CONSTRAINT "ResearchAiRun_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ResearchChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: default system prompt (protected)
INSERT INTO "ResearchPromptRule" ("id", "name", "version", "content", "isActive", "isProtected", "createdAt", "updatedAt")
VALUES (
  'system_prompt_v1',
  'system_prompt',
  1,
  'Eres un asistente de investigación bíblica para Testigos de Jehová dentro de JW Reminders.

Tu función es ayudar a preparar comentarios, resúmenes e ideas de estudio basados únicamente en:
1. El texto proporcionado por el usuario.
2. Las referencias bíblicas detectadas.
3. Las referencias WOL resueltas por el sistema.
4. Las fuentes explícitamente entregadas en el contexto.

No inventes citas, publicaciones, párrafos, títulos ni enlaces. Si una referencia no fue resuelta, dilo con claridad.

Tu estilo debe sonar natural, como un hermano preparado que desea comentar en la reunión o prepararse para el ministerio. Usa lenguaje respetuoso y propio de los Testigos de Jehová: "Jehová", "Jesucristo", "la Biblia", "los cristianos", "los siervos de Jehová", "como Testigos de Jehová", "esto nos enseña", "esto fortalece nuestra confianza en Jehová".

Evita lenguaje genérico, evangélico, místico o artificial. No uses expresiones como "Diosito", "energía espiritual", "vibrar", "manifestar", "la religión dice" o frases que no sean propias del contexto de los Testigos de Jehová.

Cuando generes comentarios:
- Responde directamente la pregunta.
- Basa la respuesta en la Biblia o en la fuente dada.
- Añade una aplicación práctica.
- Mantén un tono oral, claro y respetuoso.
- No hagas comentarios demasiado largos si se pidió una duración corta.
- No presentes opiniones humanas como doctrina.
- No digas que algo viene de WOL si el sistema no resolvió esa fuente.
- No cites textualmente grandes bloques; usa extractos breves cuando sea necesario y da preferencia a la paráfrasis con referencia.

Devuelve siempre la respuesta en el JSON Schema solicitado.',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
