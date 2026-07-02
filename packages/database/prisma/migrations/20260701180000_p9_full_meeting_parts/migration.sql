-- Fase 3: completar el resto de la reunión (aditivo, no altera SMM).
-- Añade valores a los enums AssignmentType y AssignmentSection y el campo
-- requiresAssignee a MeetingProgramItem. Todo con IF NOT EXISTS / DEFAULT para
-- ser idempotente y no romper datos existentes.

-- AssignmentType: 11 valores nuevos.
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'CHAIRMAN';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'OPENING_COMMENTS';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'OPENING_PRAYER';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'TREASURES_TALK';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'SPIRITUAL_GEMS';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'CHRISTIAN_LIVING';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'CONGREGATION_BIBLE_STUDY_CONDUCTOR';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'CONGREGATION_BIBLE_STUDY_READER';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'CONCLUDING_COMMENTS';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'CLOSING_PRAYER';
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'SONG';

-- AssignmentSection: 4 secciones nuevas.
ALTER TYPE "AssignmentSection" ADD VALUE IF NOT EXISTS 'OPENING';
ALTER TYPE "AssignmentSection" ADD VALUE IF NOT EXISTS 'TREASURES';
ALTER TYPE "AssignmentSection" ADD VALUE IF NOT EXISTS 'LIVING_AS_CHRISTIANS';
ALTER TYPE "AssignmentSection" ADD VALUE IF NOT EXISTS 'CONCLUSION';

-- MeetingProgramItem.requiresAssignee: partes informativas (canciones) => false.
ALTER TABLE "MeetingProgramItem"
  ADD COLUMN IF NOT EXISTS "requiresAssignee" BOOLEAN NOT NULL DEFAULT true;
