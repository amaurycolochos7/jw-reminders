-- P6 (Paso 6): mensaje personalizado por entrega de recordatorio.
-- Aditiva y reversible: agrega una columna opcional sin tocar datos existentes.

ALTER TABLE "ReminderDelivery" ADD COLUMN "customMessage" TEXT;
