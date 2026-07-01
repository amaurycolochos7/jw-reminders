-- P9: Backfill de capacidades para publicadores existentes (Fase 2).
--
-- Contexto: la migración P8 añadió las capacidades con canBibleReading/canGiveTalk
-- y las partes de reunión en `false` por defecto. El generador de Fase 2 filtra por
-- estas capacidades, así que sin este backfill no encontraría candidatos para
-- Lectura de la Biblia ni Discurso. Este backfill alinea los datos existentes con
-- `suggestCapabilities` (misma lógica de sugerencias del módulo shared) y NO cambia
-- el comportamiento previo del generador (que permitía a cualquier hombre en
-- Lectura/Discurso). `canParticipateSMM` y `canBeCompanion` ya venían en `true` por
-- defecto en P8, por lo que las mujeres publicadoras no requieren backfill.
--
-- Solo afecta filas existentes; es una operación de datos (sin cambios de esquema).

-- Hombres: pueden hacer Lectura de la Biblia.
UPDATE "JwPublisher" SET "canBibleReading" = true WHERE "gender" = 'MALE';

-- Hombres bautizados: además pueden hacer discurso.
UPDATE "JwPublisher" SET "canGiveTalk" = true WHERE "gender" = 'MALE' AND "isBaptized" = true;

-- Hombres nombrados (anciano / siervo ministerial): todas las partes de reunión.
UPDATE "JwPublisher" SET
  "canGiveTalk" = true,
  "canBeChairman" = true,
  "canPray" = true,
  "canTreasures" = true,
  "canSpiritualGems" = true,
  "canChristianLife" = true,
  "canConductCBS" = true,
  "canReadCBS" = true,
  "canConcludingRemarks" = true
WHERE "gender" = 'MALE' AND "appointment" IN ('ELDER', 'MINISTERIAL_SERVANT');
