-- Permitir que varios publicadores compartan el mismo número de teléfono
-- (p. ej. parejas o familiares que usan un mismo WhatsApp). Se elimina la
-- restricción de unicidad del teléfono. El número sigue usándose para las
-- automatizaciones/envíos, pero ya no impide guardar dos publicadores con el
-- mismo número. Idempotente y no destructivo (solo quita el índice único).
DROP INDEX IF EXISTS "JwPublisher_phone_key";
