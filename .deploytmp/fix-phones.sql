-- 1. Poner whatsappPhone = phone para todos (el numero de prueba)
UPDATE "JwPublisher" SET "whatsappPhone" = '5219618720544' WHERE "whatsappPhone" != '5219618720544' OR "whatsappPhone" IS NULL;

-- 2. Activar TEST_MODE y poner TEST_PHONE en AppConfig
UPDATE "AppConfig" SET value = 'true' WHERE key = 'TEST_MODE';
UPDATE "AppConfig" SET value = '5219618720544' WHERE key = 'TEST_PHONE';

-- Si no existen, insertarlos
INSERT INTO "AppConfig" (key, value) VALUES ('TEST_MODE', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true';
INSERT INTO "AppConfig" (key, value) VALUES ('TEST_PHONE', '5219618720544') ON CONFLICT (key) DO UPDATE SET value = '5219618720544';

-- Verificar
SELECT key, value FROM "AppConfig" WHERE key IN ('TEST_MODE', 'TEST_PHONE');
SELECT "fullName", phone, "whatsappPhone" FROM "JwPublisher" LIMIT 5;
