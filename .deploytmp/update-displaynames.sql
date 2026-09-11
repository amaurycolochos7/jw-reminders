-- Nombre visible = primer token + inicial del SEGUNDO token (primer apellido)
-- Salta partículas: si el 2do token es "de","la","del","QA","TEST" toma el siguiente
UPDATE "JwPublisher"
SET "displayName" = CASE
  WHEN array_length(string_to_array(trim("fullName"), ' '), 1) <= 1
    THEN trim("fullName")
  WHEN lower(split_part(trim("fullName"), ' ', 2)) IN ('de', 'la', 'del', 'qa', 'test')
       AND array_length(string_to_array(trim("fullName"), ' '), 1) >= 3
    THEN
      CASE
        WHEN lower(split_part(trim("fullName"), ' ', 3)) IN ('la', 'el', 'los', 'las')
             AND array_length(string_to_array(trim("fullName"), ' '), 1) >= 4
          THEN split_part(trim("fullName"), ' ', 1) || ' ' || left(split_part(trim("fullName"), ' ', 4), 1)
        ELSE split_part(trim("fullName"), ' ', 1) || ' ' || left(split_part(trim("fullName"), ' ', 3), 1)
      END
  ELSE
    split_part(trim("fullName"), ' ', 1) || ' ' || left(split_part(trim("fullName"), ' ', 2), 1)
  END
WHERE "fullName" IS NOT NULL AND trim("fullName") != '';

SELECT "fullName", "displayName" FROM "JwPublisher" ORDER BY "fullName";
