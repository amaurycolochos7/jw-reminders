-- CreateTable
CREATE TABLE "ResearchProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "promptRuleName" TEXT NOT NULL,
    "defaultOutputType" TEXT,
    "defaultLevel" TEXT,
    "defaultDuration" TEXT,
    "forcePrecursorMatch" BOOLEAN NOT NULL DEFAULT false,
    "themeKey" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchProfile_pkey" PRIMARY KEY ("id")
);

-- Seed default profiles BEFORE adding the FK on ResearchChatSession.profileId,
-- so existing sessions (which get the 'general' default) satisfy the constraint.
INSERT INTO "ResearchProfile"
    ("id", "name", "description", "promptRuleName", "defaultOutputType", "defaultLevel", "defaultDuration", "forcePrecursorMatch", "themeKey", "isActive", "order", "updatedAt")
VALUES
    ('general', 'General', 'Investigación bíblica general con Biblia, WOL y publicaciones locales.', 'system_prompt', NULL, NULL, NULL, false, 'general', true, 0, CURRENT_TIMESTAMP),
    ('precursor', 'Escuela de precursores', 'Análisis enfocado exclusivamente en el libro "Cumple completamente tu ministerio".', 'system_prompt_precursor', 'comments', 'profundo', 'auto', true, 'precursor', true, 1, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "ResearchChatSession" ADD COLUMN     "profileId" TEXT NOT NULL DEFAULT 'general';

-- CreateIndex
CREATE INDEX "ResearchChatSession_profileId_idx" ON "ResearchChatSession"("profileId");

-- AddForeignKey
ALTER TABLE "ResearchChatSession" ADD CONSTRAINT "ResearchChatSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ResearchProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
