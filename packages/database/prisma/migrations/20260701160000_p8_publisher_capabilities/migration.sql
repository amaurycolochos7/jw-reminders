-- P8: Estado congregacional y capacidades editables del publicador.
-- Añade un enum de nombramiento y columnas booleanas tipadas al modelo JwPublisher.
-- Los valores por defecto se eligieron para NO cambiar el comportamiento actual del
-- generador (que aún no consume estas capacidades): solo se conceden capacidades
-- neutrales por defecto y el resto quedan en false hasta que el administrador las active.

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('NONE', 'ELDER', 'MINISTERIAL_SERVANT');

-- AlterTable
ALTER TABLE "JwPublisher"
  ADD COLUMN "isBaptized" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isRegularPioneer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "appointment" "AppointmentType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "canParticipateSMM" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canBibleReading" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canGiveTalk" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canBeChairman" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canPray" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canTreasures" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canSpiritualGems" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canChristianLife" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canConductCBS" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canReadCBS" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canConcludingRemarks" BOOLEAN NOT NULL DEFAULT false;
