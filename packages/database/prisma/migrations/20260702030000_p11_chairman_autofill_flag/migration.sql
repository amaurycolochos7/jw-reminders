-- Inicio de reunión: marca de autocompletado del presidente.
-- La oración inicial y las palabras de introducción se autocompletan con el
-- presidente. Este flag indica que el valor fue autocompletado y NO editado a
-- mano; cuando es true, al cambiar el presidente se resincroniza. Al editar la
-- persona manualmente pasa a false. Aditivo, con DEFAULT para filas existentes.
ALTER TABLE "JwAssignment"
  ADD COLUMN IF NOT EXISTS "autoFilledFromChairman" BOOLEAN NOT NULL DEFAULT false;
