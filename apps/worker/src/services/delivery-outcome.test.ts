import { test } from "node:test";
import assert from "node:assert/strict";
import { planFinalState, planReaperTarget, evaluateSendGate } from "./delivery-outcome.js";
import type { SendResult } from "@jw-reminders/shared/whatsapp";

const base = { attemptCount: 0, maxAttempts: 3 };

test("SENT ⇒ estado SENT, cuenta intento, con auditoría", () => {
  const r: SendResult = { success: true, outcome: "SENT", messageId: "m1" };
  const p = planFinalState(base, r);
  assert.equal(p.status, "SENT");
  assert.equal(p.attemptCountDelta, 1);
  assert.equal(p.recordAudit, true);
  assert.equal(p.scheduleRetry, false);
});

test("DEDUPED ⇒ tratado como SENT (no reenvía, marca entregado)", () => {
  const r: SendResult = { success: true, outcome: "DEDUPED", deduped: true, messageId: "m1" };
  const p = planFinalState(base, r);
  assert.equal(p.status, "SENT");
});

test("NOT_READY ⇒ vuelve a PENDING, NO cuenta intento, NO audita, NO reintenta ya", () => {
  const r: SendResult = { success: false, outcome: "NOT_READY", error: "no listo" };
  const p = planFinalState(base, r);
  assert.equal(p.status, "PENDING");
  assert.equal(p.attemptCountDelta, 0);
  assert.equal(p.recordAudit, false);
  assert.equal(p.scheduleRetry, false);
});

test("UNCERTAIN (error ambiguo) ⇒ UNCERTAIN, NO cuenta intento, NO auto-retry (anti-duplicado)", () => {
  const r: SendResult = { success: false, outcome: "UNCERTAIN", error: "timeout tras encolar" };
  const p = planFinalState(base, r);
  assert.equal(p.status, "UNCERTAIN");
  assert.equal(p.attemptCountDelta, 0);
  assert.equal(p.scheduleRetry, false);
  // Se audita para forense, pero NO se programa reintento automático.
  assert.equal(p.recordAudit, true);
});

test("REJECTED no terminal ⇒ FAILED con reintento programado", () => {
  const r: SendResult = { success: false, outcome: "REJECTED", error: "numero invalido" };
  const p = planFinalState({ attemptCount: 0, maxAttempts: 3 }, r);
  assert.equal(p.status, "FAILED");
  assert.equal(p.attemptCountDelta, 1);
  assert.equal(p.scheduleRetry, true);
  assert.equal(p.terminal, false);
});

test("REJECTED en último intento ⇒ DEAD (sin más reintentos)", () => {
  const r: SendResult = { success: false, outcome: "REJECTED", error: "numero invalido" };
  const p = planFinalState({ attemptCount: 2, maxAttempts: 3 }, r);
  assert.equal(p.status, "DEAD");
  assert.equal(p.terminal, true);
  assert.equal(p.scheduleRetry, false);
});

test("simulación de GRUPO: todas las entregas comparten el mismo resultado ⇒ mismo plan", () => {
  const r: SendResult = { success: false, outcome: "UNCERTAIN", error: "ambiguo" };
  const deliveries = [
    { attemptCount: 0, maxAttempts: 3 },
    { attemptCount: 0, maxAttempts: 3 },
    { attemptCount: 0, maxAttempts: 3 },
  ];
  const plans = deliveries.map((d) => planFinalState(d, r));
  // Ninguna del grupo se reintenta automáticamente ⇒ no hay reenvío N veces.
  for (const p of plans) {
    assert.equal(p.status, "UNCERTAIN");
    assert.equal(p.scheduleRetry, false);
  }
});

// ── Reaper (reconciliación de SENDING atorado) ──
test("reaper: outbox SENT ⇒ reconciliar a SENT (no reenviar)", () => {
  assert.equal(planReaperTarget("SENT"), "SENT");
});
test("reaper: outbox UNCERTAIN o SENDING ⇒ UNCERTAIN (no reintentar a ciegas)", () => {
  assert.equal(planReaperTarget("UNCERTAIN"), "UNCERTAIN");
  assert.equal(planReaperTarget("SENDING"), "UNCERTAIN");
});
test("reaper: outbox FAILED o sin evidencia ⇒ PENDING (seguro reintentar)", () => {
  assert.equal(planReaperTarget("FAILED"), "PENDING");
  assert.equal(planReaperTarget(null), "PENDING");
  assert.equal(planReaperTarget(undefined), "PENDING");
});

// ── Fase 6: gate de envíos (pausa manual / pausa automática) ──
test("gate: todo listo ⇒ proceder", () => {
  assert.deepEqual(evaluateSendGate({ manualPause: false, whatsappReady: true }), { proceed: true, reason: "ok" });
});
test("gate: pausa MANUAL tiene prioridad aunque WhatsApp esté READY (sticky)", () => {
  assert.deepEqual(evaluateSendGate({ manualPause: true, whatsappReady: true }), { proceed: false, reason: "paused_manual" });
});
test("gate: WhatsApp no READY ⇒ pausa automática (cola protegida)", () => {
  assert.deepEqual(evaluateSendGate({ manualPause: false, whatsappReady: false }), { proceed: false, reason: "whatsapp_not_ready" });
});
