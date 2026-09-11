-- 1. Verificar phones en JwPublisher
SELECT id, "fullName", phone, "whatsappPhone" FROM "JwPublisher" LIMIT 10;

-- 2. Verificar snapshots en recordatorios pendientes (lo que realmente se usa para enviar)
SELECT rd.id, rd.status, rd."recipientPhone", a."assignedPhoneSnapshot", a."companionPhoneSnapshot", p."fullName", p.phone
FROM "ReminderDelivery" rd
JOIN "JwAssignment" a ON a.id = rd."assignmentId"
LEFT JOIN "JwPublisher" p ON p.id = a."assignedPublisherId"
WHERE rd.status IN ('PENDING', 'READY', 'QUEUED', 'SENDING')
LIMIT 10;

-- 3. Ver env TEST_MODE y TEST_PHONE en AppConfig
SELECT key, value FROM "AppConfig" WHERE key IN ('TEST_MODE', 'TEST_PHONE');
