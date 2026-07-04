-- Fase 2 (mensajería robusta): migración ADITIVA y no destructiva.
-- Añade: estados DRAFT/READY/PAUSED, versionado de plantillas, lote de mensajes
-- (MessageBatch) y campos de snapshot congelado en ReminderDelivery.
-- No borra ni altera datos existentes.

-- AlterEnum
ALTER TYPE "ReminderStatus" ADD VALUE 'DRAFT';
ALTER TYPE "ReminderStatus" ADD VALUE 'READY';
ALTER TYPE "ReminderStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "ReminderDelivery" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "regeneratedAt" TIMESTAMP(3),
ADD COLUMN     "renderedMessage" TEXT,
ADD COLUMN     "renderedVariables" JSONB,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateVersionId" TEXT;

-- AlterTable
ALTER TABLE "JwMessageTemplate" ADD COLUMN     "activeVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "MessageTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "variablesSchema" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "MessageTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageBatch" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "monthlyScheduleId" TEXT,
    "meetingWeekId" TEXT,
    "periodLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "resumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageTemplateVersion_templateId_idx" ON "MessageTemplateVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplateVersion_templateId_version_key" ON "MessageTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "MessageBatch_status_idx" ON "MessageBatch"("status");

-- CreateIndex
CREATE INDEX "MessageBatch_monthlyScheduleId_idx" ON "MessageBatch"("monthlyScheduleId");

-- CreateIndex
CREATE INDEX "MessageBatch_meetingWeekId_idx" ON "MessageBatch"("meetingWeekId");

-- CreateIndex
CREATE INDEX "ReminderDelivery_batchId_idx" ON "ReminderDelivery"("batchId");

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MessageBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplateVersion" ADD CONSTRAINT "MessageTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JwMessageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
