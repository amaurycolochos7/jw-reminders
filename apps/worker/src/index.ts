import * as cron from "node-cron";
import { processReminders, reconcileStuckDeliveries } from "./jobs/process-reminders.js";

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/2 * * * *";

console.log(`[Worker] Iniciando servicio de envío automático...`);

// Reconciliar entregas atoradas y luego procesar de inmediato.
reconcileStuckDeliveries()
  .then(() => {
    console.log("[Worker] Reconciliación completada. Procesando pendientes...");
    return processReminders();
  })
  .then(() => console.log("[Worker] Primer procesamiento completado."))
  .catch((err) => console.error("[Worker] Error inicial:", err));

// Respaldo: cada 2 min revisa si hay nuevos pendientes.
cron.schedule(CRON_SCHEDULE, async () => {
  try {
    await processReminders();
  } catch (err) {
    console.error("[Worker] Error procesando:", err);
  }
});

const shutdown = () => { console.log("[Worker] Cerrando..."); process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[Worker] Listo. Envíos automáticos activos.");
