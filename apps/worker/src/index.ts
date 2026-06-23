import cron from "node-cron";
import { processReminders } from "./jobs/process-reminders.js";

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/10 * * * *"; // every 10 min

console.log(`[Worker] Starting with schedule: ${CRON_SCHEDULE}`);

cron.schedule(CRON_SCHEDULE, async () => {
  console.log(`[Worker] Processing reminders at ${new Date().toISOString()}`);
  try {
    await processReminders();
  } catch (err) {
    console.error("[Worker] Error processing reminders:", err);
  }
});

// Graceful shutdown
const shutdown = () => {
  console.log("[Worker] Shutting down...");
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[Worker] Ready. Waiting for next tick...");
