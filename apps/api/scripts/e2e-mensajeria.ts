/**
 * E2E full-stack (TEST_MODE) del flujo de mensajería robusta.
 *
 * NO envía mensajes reales: levanta un servidor WhatsApp FALSO que registra el
 * texto recibido y responde SENT. Compara enviado === snapshot y valida los
 * casos de inmutabilidad, regeneración, edición manual, aprobación y dedup.
 *
 * Ejecutar (con DB limpia y migrada):
 *   DATABASE_URL=... WHATSAPP_API_URL=http://localhost:3999 TEST_MODE=true \
 *   TEST_PHONE=5219990000000 WHATSAPP_SEND_DELAY_MIN_MS=0 WHATSAPP_SEND_DELAY_MAX_MS=0 \
 *   tsx scripts/e2e-mensajeria.ts
 */
import http from "node:http";
import assert from "node:assert/strict";
import { prisma } from "@jw-reminders/database";
import {
  generateSnapshots,
  editFinalMessage,
  regenerateFromTemplate,
  approveBatch,
  previewDeliveryFrozen,
} from "../src/services/message-snapshot.service.js";
import { createAutomationPlanForAssignment } from "../src/services/automation.service.js";
import { processReminders } from "../../worker/src/jobs/process-reminders.js";

const received: { phone: string; message: string }[] = [];
let server: http.Server;

function startFakeWhatsApp(port: number): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/send") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          const { phone, message } = JSON.parse(body || "{}");
          received.push({ phone, message });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, outcome: "SENT", messageId: `FAKE-${received.length}` }));
        });
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, status: "READY" }));
      }
    });
    server.listen(port, () => resolve());
  });
}

function log(step: string, ok = true) {
  console.log(`${ok ? "✅" : "❌"} ${step}`);
}

async function cleanup() {
  const sched = await prisma.monthlySchedule.findUnique({ where: { year_month: { year: 2099, month: 7 } } });
  const pub = await prisma.jwPublisher.findFirst({ where: { fullName: "E2E Tester" } });
  if (pub) {
    await prisma.jwMessageLog.deleteMany({ where: { publisherId: pub.id } });
    await prisma.notificationLog.deleteMany({ where: { recipientPersonId: pub.id } });
    await prisma.reminderDelivery.deleteMany({ where: { publisherId: pub.id } });
    await prisma.jwAssignmentReminder.deleteMany({ where: { publisherId: pub.id } });
    await prisma.automationPlan.deleteMany({ where: { assignment: { assignedPublisherId: pub.id } } });
    await prisma.jwAssignment.deleteMany({ where: { assignedPublisherId: pub.id } });
  }
  if (sched) {
    await prisma.messageBatch.deleteMany({ where: { monthlyScheduleId: sched.id } });
    await prisma.jwAssignment.deleteMany({ where: { meetingWeek: { monthlyScheduleId: sched.id } } });
    await prisma.jwMeetingWeek.deleteMany({ where: { monthlyScheduleId: sched.id } });
    await prisma.monthlySchedule.delete({ where: { id: sched.id } });
  }
  if (pub) await prisma.jwPublisher.delete({ where: { id: pub.id } });
  await prisma.appConfig.upsert({ where: { key: "SENDS_PAUSED" }, update: { value: "false" }, create: { key: "SENDS_PAUSED", value: "false" } });
}

async function main() {
  await startFakeWhatsApp(3999);
  await cleanup();

  // Guardamos el cuerpo canónico de la plantilla para restaurarlo al final
  // (el caso 1 la muta a propósito para probar inmutabilidad).
  const tplOrig = await prisma.jwMessageTemplate.findUniqueOrThrow({ where: { type: "INITIAL_NOTICE" } });
  const verOrig = await prisma.messageTemplateVersion.findFirst({ where: { templateId: tplOrig.id, version: tplOrig.activeVersion } });

  // ── Datos sintéticos ──────────────────────────────────────────────────────
  const schedule = await prisma.monthlySchedule.create({
    data: { year: 2099, month: 7, name: "E2E Julio 2099", status: "ACTIVE" },
  });
  const publisher = await prisma.jwPublisher.create({
    data: { fullName: "E2E Tester", displayName: "Carlos E2E", phone: "5219990000000", gender: "MALE", canBibleReading: true },
  });
  // Dos semanas del mismo mes → dos asignaciones de la misma persona → el aviso
  // inicial debe AGRUPAR ambas en un solo mensaje.
  const mkWeek = (day: number) =>
    prisma.jwMeetingWeek.create({
      data: {
        monthlyScheduleId: schedule.id,
        weekStartDate: new Date(`2099-07-${String(day - 4).padStart(2, "0")}T00:00:00Z`),
        meetingDate: new Date(`2099-07-${String(day).padStart(2, "0")}T12:00:00Z`),
        meetingDateLocal: `2099-07-${String(day).padStart(2, "0")}`,
        meetingTime: "19:00",
        status: "ACTIVE",
      },
    });
  const week1 = await mkWeek(10);
  const week2 = await mkWeek(17);

  const mkAssign = (weekId: string, num: number, title: string) =>
    prisma.jwAssignment.create({
      data: {
        meetingWeekId: weekId,
        assignmentNumber: num,
        section: "BIBLE_READING",
        assignmentType: "BIBLE_READING",
        title,
        durationMinutes: 4,
        assignedPublisherId: publisher.id,
        room: "MAIN",
        status: "SCHEDULED",
      },
    });
  const a1 = await mkAssign(week1.id, 3, "Lectura de la Biblia");
  const a2 = await mkAssign(week2.id, 3, "Lectura de la Biblia");

  // Planes de automatización (crean las ReminderDelivery, incl. INITIAL_NOTICE).
  await prisma.$transaction(async (tx) => {
    await createAutomationPlanForAssignment(tx as any, a1.id, { includeInitial: true, includeNormal: true });
    await createAutomationPlanForAssignment(tx as any, a2.id, { includeInitial: true, includeNormal: true });
  });

  const initialDeliveries = await prisma.reminderDelivery.findMany({
    where: { publisherId: publisher.id, reminderType: "INITIAL_NOTICE" },
  });
  assert.equal(initialDeliveries.length, 2, "deben existir 2 entregas INITIAL_NOTICE (una por asignación)");
  log("Automatización generada: 2 entregas INITIAL_NOTICE (sin snapshot aún)");
  assert.ok(initialDeliveries.every((d) => d.renderedMessage === null), "aún sin renderedMessage");

  // ── generateSnapshots (congelado + agrupación) ────────────────────────────
  const gen = await generateSnapshots({ reminderType: "INITIAL_NOTICE", monthlyScheduleId: schedule.id, periodLabel: "E2E Julio 2099" });
  log(`generateSnapshots: batch=${gen.batchId} grupos=${gen.groups} congelados=${gen.frozen}`);
  assert.equal(gen.groups, 1, "las 2 asignaciones de la persona → 1 grupo (1 mensaje)");
  assert.equal(gen.frozen, 2, "ambas entregas quedan congeladas con el mismo texto");

  const frozen = await prisma.reminderDelivery.findMany({ where: { batchId: gen.batchId! } });
  const snapshot = frozen[0].renderedMessage!;
  assert.ok(snapshot, "renderedMessage guardado");
  assert.ok(frozen.every((d) => d.renderedMessage === snapshot), "todas las hermanas comparten el snapshot");
  // Contenido: negritas, saltos, agrupación de ambas fechas, listaAsignaciones expandida.
  assert.ok(snapshot.includes("Hola *Carlos E2E*."), "nombre en negrita sustituido");
  assert.ok(snapshot.includes("10 de julio de 2099"), "fecha 1 presente");
  assert.ok(snapshot.includes("17 de julio de 2099"), "fecha 2 presente — AGRUPADO");
  assert.ok(/\*\w+ 10 de julio de 2099\*/u.test(snapshot), "fecha 1 en negrita");
  assert.ok(snapshot.includes("*Lectura de la Biblia*"), "sección en negrita");
  assert.ok(snapshot.includes("\n"), "saltos de línea preservados");
  assert.ok(!snapshot.includes("{{"), "sin tokens sin sustituir");
  log("Snapshot congelado con negritas, saltos y AGRUPACIÓN de 2 asignaciones en 1 mensaje");
  console.log("----- SNAPSHOT -----\n" + snapshot + "\n--------------------");

  // ── Paridad preview === snapshot ──────────────────────────────────────────
  const preview = await previewDeliveryFrozen(frozen[0].id);
  assert.equal(preview!.renderedMessage, snapshot, "preview === snapshot");
  log("PARIDAD: previewDeliveryFrozen === renderedMessage guardado");

  // ── Caso 1: editar la PLANTILLA no cambia el snapshot ─────────────────────
  const tpl = await prisma.jwMessageTemplate.findUniqueOrThrow({ where: { type: "INITIAL_NOTICE" } });
  await prisma.jwMessageTemplate.update({ where: { id: tpl.id }, data: { body: "PLANTILLA CAMBIADA {{nombre}}" } });
  await prisma.messageTemplateVersion.updateMany({ where: { templateId: tpl.id, version: tpl.activeVersion }, data: { body: "PLANTILLA CAMBIADA {{nombre}}" } });
  const afterTplEdit = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: frozen[0].id } });
  assert.equal(afterTplEdit.renderedMessage, snapshot, "editar plantilla NO cambia el snapshot");
  log("Caso 1: editar plantilla global NO cambia el mensaje ya generado");

  // ── Caso 2: editar datos del publicador no cambia el snapshot ─────────────
  await prisma.jwPublisher.update({ where: { id: publisher.id }, data: { displayName: "NOMBRE CAMBIADO" } });
  const afterPubEdit = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: frozen[0].id } });
  assert.equal(afterPubEdit.renderedMessage, snapshot, "editar publicador NO cambia el snapshot");
  log("Caso 2: editar datos del publicador NO cambia el mensaje ya generado");

  // ── Caso 3: regenerar SÍ cambia y queda registrado ────────────────────────
  const regen = await regenerateFromTemplate(frozen[0].id);
  const afterRegen = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: frozen[0].id } });
  assert.notEqual(afterRegen.renderedMessage, snapshot, "regenerar SÍ cambia el mensaje");
  assert.ok(afterRegen.renderedMessage!.includes("PLANTILLA CAMBIADA"), "usa la plantilla actual");
  assert.ok(afterRegen.renderedMessage!.includes("NOMBRE CAMBIADO"), "usa datos actuales");
  assert.ok(afterRegen.regeneratedAt, "regeneratedAt registrado");
  assert.equal(afterRegen.sourceType, "REGENERATED_TEMPLATE", "sourceType marcado");
  log(`Caso 3: regenerar manual SÍ cambia (afecta ${regen.updated} hermanas) y queda registrado (regeneratedAt/sourceType)`);

  // ── Caso 4: editar manualmente el mensaje final ───────────────────────────
  const manualText = "TEXTO FINAL MANUAL *negrita* 🙂\n- viñeta 1\n- viñeta 2";
  await editFinalMessage(frozen[0].id, manualText);
  const afterManual = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: frozen[0].id } });
  assert.equal(afterManual.renderedMessage, manualText, "el mensaje final es exactamente el editado");
  assert.equal(afterManual.manuallyEdited, true, "manuallyEdited = true");
  log("Caso 4: edición manual del mensaje final guardada (manuallyEdited=true)");

  // ── Caso 5: no aprobar batch con renderedMessage vacío ────────────────────
  // Forzamos una entrega del batch a renderedMessage null para probar el guard.
  await prisma.reminderDelivery.update({ where: { id: frozen[1].id }, data: { renderedMessage: null } });
  let approveBlocked = false;
  try {
    await approveBatch(gen.batchId!);
  } catch (e) {
    approveBlocked = true;
  }
  assert.ok(approveBlocked, "approveBatch DEBE fallar si hay renderedMessage vacío");
  log("Caso 5: NO se puede aprobar un batch con renderedMessage vacío (guard OK)");
  // Restauramos el snapshot (regeneramos la entrega afectada) para poder aprobar.
  await regenerateFromTemplate(frozen[1].id);
  // Re-aplicamos la edición manual (regenerate la sobrescribió en el grupo).
  await editFinalMessage(frozen[0].id, manualText);

  // ── Aprobar DRAFT → READY ─────────────────────────────────────────────────
  const appr = await approveBatch(gen.batchId!);
  log(`Aprobación: DRAFT → READY (${appr.approved} entregas)`);
  const readyRows = await prisma.reminderDelivery.findMany({ where: { batchId: gen.batchId! } });
  assert.ok(readyRows.every((d) => d.status === "READY"), "todas READY");

  // ── Fase 6: pausa manual protege la cola (no envía, no pierde) ────────────
  await prisma.appConfig.upsert({ where: { key: "SENDS_PAUSED" }, update: { value: "true" }, create: { key: "SENDS_PAUSED", value: "true" } });
  received.length = 0;
  await processReminders();
  assert.equal(received.length, 0, "en pausa NO se envía");
  const stillReady = await prisma.reminderDelivery.findMany({ where: { batchId: gen.batchId!, status: "READY" } });
  assert.equal(stillReady.length, 2, "la cola queda intacta (siguen READY, sin consumir intento)");
  log("Fase 6: pausa manual → no envía y protege la cola (siguen READY)");
  // Reanudar
  await prisma.appConfig.update({ where: { key: "SENDS_PAUSED" }, data: { value: "false" } });
  log("Fase 6: reanudación (SENDS_PAUSED=false)");

  // ── Worker envía SOLO renderedMessage (TEST_MODE, WhatsApp mock) ──────────
  received.length = 0;
  await processReminders();
  const sentRows = await prisma.reminderDelivery.findMany({ where: { batchId: gen.batchId!, status: "SENT" } });
  assert.equal(received.length, 1, "un solo mensaje físico para el grupo (agrupado)");
  assert.equal(received[0].phone, "5219990000000", "TEST_MODE → TEST_PHONE");
  assert.equal(received[0].message, manualText, "ENVIADO === snapshot (mensaje final manual)");
  assert.equal(sentRows.length, 2, "las 2 entregas del grupo marcadas SENT");
  const logRow = await prisma.jwMessageLog.findFirst({ where: { publisherId: publisher.id }, orderBy: { createdAt: "desc" } });
  assert.equal(logRow?.messageBody, manualText, "JwMessageLog.messageBody === enviado");
  log("Worker envió EXACTAMENTE el snapshot/mensaje final (enviado === snapshot === log)");

  // ── No duplicado: segundo tick no reenvía ─────────────────────────────────
  await processReminders();
  assert.equal(received.length, 1, "segundo tick NO reenvía (sin duplicado)");
  log("No duplicado: segundo tick del worker no reenvía");

  // ── Restricción de fallback: flujo nuevo sin snapshot se BLOQUEA ──────────
  const blockDelivery = await prisma.reminderDelivery.findFirst({ where: { batchId: gen.batchId! } });
  await prisma.reminderDelivery.update({
    where: { id: blockDelivery!.id },
    data: { status: "READY", renderedMessage: null, sentAt: null },
  });
  received.length = 0;
  await processReminders();
  const blocked = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: blockDelivery!.id } });
  assert.equal(received.length, 0, "flujo nuevo sin snapshot NO se envía");
  assert.equal(blocked.status, "SKIPPED", "queda SKIPPED (bloqueado, no renderizado)");
  log("Restricción de fallback: flujo nuevo sin snapshot se BLOQUEA (SKIPPED), no se renderiza");

  console.log("\n🎉 E2E COMPLETO: todos los asertos pasaron.");

  // Restaurar plantilla canónica y limpiar datos de prueba (reproducible).
  await prisma.jwMessageTemplate.update({ where: { id: tplOrig.id }, data: { body: tplOrig.body } });
  if (verOrig) await prisma.messageTemplateVersion.update({ where: { id: verOrig.id }, data: { body: verOrig.body } });
  await cleanup();
  log("Limpieza final: plantilla restaurada y datos de prueba eliminados");
}

main()
  .then(async () => {
    server?.close();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\n❌ E2E FALLÓ:", err);
    server?.close();
    await prisma.$disconnect();
    process.exit(1);
  });
