-- H1–H5: Endurecimiento (Hardening) del servicio de WhatsApp.
-- 100% ADITIVA Y SEGURA: no borra ni altera datos existentes; solo agrega un
-- valor de enum, dos columnas opcionales y una tabla nueva. Idempotente por los
-- IF NOT EXISTS para poder aplicarse sin riesgo aunque se re-ejecute.

-- 1) Nuevo estado UNCERTAIN (envío ambiguo, no se reintenta de forma automática).
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'UNCERTAIN';

-- 2) Clave idempotente + marca de incertidumbre en ReminderDelivery (opcionales).
ALTER TABLE "ReminderDelivery" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "ReminderDelivery" ADD COLUMN IF NOT EXISTS "uncertainAt" TIMESTAMP(3);

-- 3) Outbox de idempotencia del servicio WhatsApp.
CREATE TABLE IF NOT EXISTS "WhatsappOutbox" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "WhatsappOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappOutbox_idempotencyKey_key" ON "WhatsappOutbox"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "WhatsappOutbox_phone_contentHash_status_idx" ON "WhatsappOutbox"("phone", "contentHash", "status");
CREATE INDEX IF NOT EXISTS "WhatsappOutbox_status_updatedAt_idx" ON "WhatsappOutbox"("status", "updatedAt");
