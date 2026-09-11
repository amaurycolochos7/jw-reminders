-- AlterTable
ALTER TABLE "ResearchProfile" ADD COLUMN     "reasoningEffort" TEXT;

-- Enable extended reasoning only for the "Escuela de precursores" profile.
UPDATE "ResearchProfile" SET "reasoningEffort" = 'medium' WHERE "id" = 'precursor';
