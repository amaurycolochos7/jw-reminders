/**
 * Smoke test de los ENDPOINTS HTTP que consume el frontend de Fase 7.
 * Levanta la app Express en proceso y hace el recorrido real con fetch + Bearer.
 * Requiere DB limpia+migrada+seed y PORT libre.
 */
import "../src/server.js"; // inicia app.listen(PORT)
import http from "node:http";
import { prisma } from "@jw-reminders/database";
import { createAutomationPlanForAssignment } from "../src/services/automation.service.js";

const BASE = `http://localhost:${process.env.PORT || 4000}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let token = "";

// WhatsApp MOCK (para que la guardia de envío vea READY). Puerto de WHATSAPP_API_URL.
const waReceived: { phone: string; message: string }[] = [];
let waServer: http.Server;
function startFakeWhatsApp(): Promise<void> {
  const url = new URL(process.env.WHATSAPP_API_URL || "http://localhost:3999");
  return new Promise((resolve) => {
    waServer = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/send") {
        let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
          const { phone, message } = JSON.parse(b || "{}"); waReceived.push({ phone, message });
          res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true, outcome: "SENT", messageId: `FAKE-${waReceived.length}` }));
        });
      } else { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ status: "READY" })); }
    });
    waServer.listen(Number(url.port), () => resolve());
  });
}

async function call(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
function ok(label: string, cond: boolean, extra = "") { console.log(`${cond ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`); if (!cond) throw new Error("FALLO: " + label); }

async function cleanup() {
  const pub = await prisma.jwPublisher.findFirst({ where: { fullName: "SMOKE Tester" } });
  const sched = await prisma.monthlySchedule.findUnique({ where: { year_month: { year: 2098, month: 8 } } });
  if (pub) {
    await prisma.jwMessageLog.deleteMany({ where: { publisherId: pub.id } });
    await prisma.notificationLog.deleteMany({ where: { recipientPersonId: pub.id } });
    await prisma.reminderDelivery.deleteMany({ where: { publisherId: pub.id } });
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
}

async function main() {
  await sleep(1500);
  await startFakeWhatsApp();
  await cleanup();

  // 1) Login
  const login = await call("POST", "/api/auth/login", { email: "admin", password: "dorian123" });
  ok("POST /auth/login", login.status === 200 && !!login.data.token);
  token = login.data.token;

  // 2) Plantillas: lista + variables
  const list = await call("GET", "/api/message-templates");
  const initial = list.data.find((t: any) => t.type === "INITIAL_NOTICE");
  ok("GET /message-templates (activa + connectedToSend)", list.status === 200 && initial?.connectedToSend === true);
  const vars = await call("GET", "/api/message-templates/variables");
  ok("GET /message-templates/variables", vars.status === 200 && vars.data.some((v: any) => v.name === "listaAsignaciones"));

  // 3) Preview con render único
  const prev = await call("POST", `/api/message-templates/${initial.id}/preview`, { body: "Hola *{{nombre}}*.\n{{listaAsignaciones}}" });
  ok("POST /message-templates/:id/preview (render único)", prev.status === 200 && prev.data.rendered.includes("Carlos"));

  // 4) Editar → crea versión nueva
  const before = initial.activeVersion;
  const put = await call("PUT", `/api/message-templates/${initial.id}`, { body: initial.body + "\n\n(editado smoke)" });
  ok("PUT /message-templates/:id crea versión", put.status === 200 && put.data.versionCreated === before + 1, `v${put.data.versionCreated}`);
  const versions = await call("GET", `/api/message-templates/${initial.id}/versions`);
  ok("GET /message-templates/:id/versions", versions.status === 200 && versions.data.length >= 2);
  // restaurar cuerpo original (nueva versión) para no dejar el texto de smoke
  await call("PUT", `/api/message-templates/${initial.id}`, { body: initial.body });

  // 5) Datos sintéticos para generar un batch
  const schedule = await prisma.monthlySchedule.create({ data: { year: 2098, month: 8, name: "SMOKE Agosto 2098", status: "ACTIVE" } });
  const pub = await prisma.jwPublisher.create({ data: { fullName: "SMOKE Tester", displayName: "Ana SMOKE", phone: "5219990000001", gender: "FEMALE" } });
  const week = await prisma.jwMeetingWeek.create({ data: { monthlyScheduleId: schedule.id, weekStartDate: new Date("2098-08-04T12:00:00Z"), meetingDate: new Date("2098-08-08T12:00:00Z"), meetingDateLocal: "2098-08-08", meetingTime: "19:00", status: "ACTIVE" } });
  const assign = await prisma.jwAssignment.create({ data: { meetingWeekId: week.id, assignmentNumber: 3, section: "APPLY_YOURSELF", assignmentType: "START_CONVERSATION", title: "Empiece conversaciones", durationMinutes: 3, assignedPublisherId: pub.id, room: "MAIN", status: "SCHEDULED" } });
  await prisma.$transaction(async (tx) => { await createAutomationPlanForAssignment(tx as any, assign.id, { includeInitial: true, includeNormal: true }); });

  // 6) Generar batch (HTTP)
  const gen = await call("POST", "/api/automation-center/batches/generate", { reminderType: "INITIAL_NOTICE", monthlyScheduleId: schedule.id, periodLabel: "SMOKE Agosto 2098" });
  ok("POST /batches/generate", gen.status === 200 && gen.data.frozen >= 1, `grupos=${gen.data.groups} congelados=${gen.data.frozen}`);
  const batchId = gen.data.batchId;

  // 7) Lista de batches + detalle (1 mensaje por persona)
  const batches = await call("GET", "/api/automation-center/batches");
  ok("GET /batches (lista)", batches.status === 200 && batches.data.some((b: any) => b.id === batchId));
  const detail = await call("GET", `/api/automation-center/batches/${batchId}`);
  ok("GET /batches/:id (1 mensaje por persona)", detail.status === 200 && detail.data.messages.length === 1);
  const deliveryId = detail.data.messages[0].deliveryId;

  // 8) Editar mensaje final (HTTP)
  const edit = await call("POST", `/api/automation-center/deliveries/${deliveryId}/edit-final`, { text: "TEXTO SMOKE FINAL *ok*" });
  ok("POST /deliveries/:id/edit-final", edit.status === 200 && edit.data.ok);
  const afterEdit = await call("GET", `/api/automation-center/batches/${batchId}`);
  ok("mensaje final == editado y manuallyEdited", afterEdit.data.messages[0].renderedMessage === "TEXTO SMOKE FINAL *ok*" && afterEdit.data.messages[0].manuallyEdited === true);

  // 9) Regenerar (HTTP) → vuelve a plantilla
  const regen = await call("POST", `/api/automation-center/deliveries/${deliveryId}/regenerate`, {});
  ok("POST /deliveries/:id/regenerate", regen.status === 200 && regen.data.ok);

  // 10) Aprobar batch (HTTP) → READY
  const appr = await call("POST", `/api/automation-center/batches/${batchId}/approve`, {});
  ok("POST /batches/:id/approve → READY", appr.status === 200 && appr.data.approved >= 1, `approved=${appr.data.approved}`);

  // 11) Estado de envíos + pausa/reanudación (HTTP)
  const s1 = await call("GET", "/api/whatsapp/send-state");
  ok("GET /whatsapp/send-state", s1.status === 200 && typeof s1.data.paused === "boolean");
  const pause = await call("POST", "/api/whatsapp/pause", { reason: "smoke" });
  ok("POST /whatsapp/pause", pause.status === 200 && pause.data.paused === true);
  const s2 = await call("GET", "/api/whatsapp/send-state");
  ok("send-state refleja pausa manual", s2.data.manualPaused === true);
  const resume = await call("POST", "/api/whatsapp/resume", {});
  ok("POST /whatsapp/resume", resume.status === 200 && resume.data.paused === false);

  // ── Fase 8: mensaje de PRUEBA y MANUAL ────────────────────────────────────
  const delivBefore = await prisma.reminderDelivery.count();
  const batchBefore = await prisma.messageBatch.count();

  // Preview de prueba (render único, sin enviar)
  const tprev = await call("POST", "/api/whatsapp/test-template/preview", { templateId: initial.id });
  ok("POST /test-template/preview (render único)", tprev.status === 200 && typeof tprev.data.rendered === "string" && tprev.data.version >= 1);

  // Envío de prueba (WA mock READY) → enviado === preview
  waReceived.length = 0;
  const tsend = await call("POST", "/api/whatsapp/test-template", { templateId: initial.id, targetPhone: "5219990000009" });
  ok("POST /test-template envía", tsend.status === 200 && tsend.data.sendResult?.sent === true);
  ok("prueba: enviado === render (preview===enviado)", waReceived.length === 1 && waReceived[0].message === tsend.data.rendered);

  // Mensaje manual (WA mock READY) → enviado === texto
  waReceived.length = 0;
  const manualText = "Aviso manual *importante* 🙂\n- punto";
  const msend = await call("POST", "/api/whatsapp/manual-send", { phone: "5219990000009", message: manualText });
  ok("POST /manual-send envía", msend.status === 200 && msend.data.sent === true);
  ok("manual: enviado === texto", waReceived.length === 1 && waReceived[0].message === manualText);

  // NO se crean batches ni deliveries por probar/enviar manual
  ok("prueba/manual NO crean deliveries ni batches", (await prisma.reminderDelivery.count()) === delivBefore && (await prisma.messageBatch.count()) === batchBefore);

  // Guardia: en pausa manual NO envía
  await call("POST", "/api/whatsapp/pause", { reason: "smoke-guard" });
  waReceived.length = 0;
  const blocked = await call("POST", "/api/whatsapp/manual-send", { phone: "5219990000009", message: "no debe salir" });
  ok("guardia: en pausa NO envía (manual)", blocked.status === 409 && blocked.data.sent === false && waReceived.length === 0);
  const blockedTest = await call("POST", "/api/whatsapp/test-template", { templateId: initial.id, targetPhone: "5219990000009" });
  ok("guardia: en pausa NO envía (prueba)", blockedTest.data.sendResult?.sent === false && waReceived.length === 0);
  await call("POST", "/api/whatsapp/resume", {});

  await cleanup();
  console.log("\n🎉 SMOKE HTTP COMPLETO: todos los endpoints del frontend responden correctamente.");
}

main().then(async () => { waServer?.close(); await prisma.$disconnect(); process.exit(0); }).catch(async (e) => { console.error("\n❌ SMOKE FALLÓ:", e); waServer?.close(); await prisma.$disconnect().catch(() => {}); process.exit(1); });
