import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canEditMessage,
  canSendNow,
  canReschedule,
  resolveOutboundMessage,
  hasCustomMessage,
  messageEditAuditMetadata,
} from "@jw-reminders/shared";

// (2) Worker usa customMessage antes que la plantilla.
test("resolveOutboundMessage usa customMessage cuando existe", () => {
  assert.equal(resolveOutboundMessage("Texto personalizado", "Plantilla"), "Texto personalizado");
});

// (3) Si customMessage esta vacio/nulo, usa la plantilla.
test("resolveOutboundMessage cae a la plantilla si customMessage vacio o nulo", () => {
  assert.equal(resolveOutboundMessage("", "Plantilla"), "Plantilla");
  assert.equal(resolveOutboundMessage("   ", "Plantilla"), "Plantilla");
  assert.equal(resolveOutboundMessage(null, "Plantilla"), "Plantilla");
  assert.equal(resolveOutboundMessage(undefined, "Plantilla"), "Plantilla");
});

// (4)(5) Editar permitido en PENDING y FAILED.
test("editar mensaje permitido en PENDING y FAILED", () => {
  assert.equal(canEditMessage("PENDING"), true);
  assert.equal(canEditMessage("FAILED"), true);
});

// (6)(7)(8)(9) Editar bloqueado en QUEUED, SENDING, SENT, CANCELLED.
test("editar mensaje bloqueado en QUEUED/SENDING/SENT/CANCELLED/DEAD", () => {
  for (const s of ["QUEUED", "SENDING", "SENT", "CANCELLED", "DEAD", "SKIPPED"]) {
    assert.equal(canEditMessage(s), false, `no debe permitir editar en ${s}`);
  }
});

// (10) Enviar ahora solo en estados permitidos.
test("enviar ahora solo en PENDING/FAILED", () => {
  assert.equal(canSendNow("PENDING"), true);
  assert.equal(canSendNow("FAILED"), true);
  for (const s of ["QUEUED", "SENDING", "SENT", "CANCELLED", "DEAD", "SKIPPED"]) {
    assert.equal(canSendNow(s), false, `no debe permitir enviar ahora en ${s}`);
  }
});

// (11) Reprogramar no permite estados peligrosos.
test("reprogramar no permite QUEUED/SENDING/SENT/CANCELLED", () => {
  assert.equal(canReschedule("PENDING"), true);
  assert.equal(canReschedule("FAILED"), true);
  for (const s of ["QUEUED", "SENDING", "SENT", "CANCELLED", "DEAD"]) {
    assert.equal(canReschedule(s), false, `no debe permitir reprogramar en ${s}`);
  }
});

// (12) Invariante anti envio-doble: las acciones que tocan scheduledAt nunca
// aplican a entregas en vuelo (QUEUED/SENDING), que es lo que el worker reclama.
test("acciones que cambian scheduledAt excluyen entregas en vuelo (sin envios dobles)", () => {
  for (const s of ["QUEUED", "SENDING"]) {
    assert.equal(canSendNow(s), false);
    assert.equal(canReschedule(s), false);
  }
});

// (13) Auditoria de edicion NO incluye el texto del mensaje.
test("messageEditAuditMetadata registra metadatos sin exponer el texto", () => {
  const meta = messageEditAuditMetadata({
    previousStatus: "PENDING",
    hadCustomMessageBefore: false,
    hasCustomMessageAfter: true,
    actorId: "admin-1",
  });
  assert.equal(meta.previousStatus, "PENDING");
  assert.equal(meta.hadCustomMessageBefore, false);
  assert.equal(meta.hasCustomMessageAfter, true);
  // No debe filtrar el contenido del mensaje.
  const serialized = JSON.stringify(meta).toLowerCase();
  assert.ok(!serialized.includes("custommessage\":\""), "no debe incluir texto del mensaje");
  assert.ok(!Object.keys(meta).some((k) => k.toLowerCase() === "message" || k.toLowerCase() === "text"));
});

// (14) Indicador "Mensaje personalizado" se basa en hasCustomMessage.
test("hasCustomMessage detecta mensaje personalizado activo", () => {
  assert.equal(hasCustomMessage("Hola"), true);
  assert.equal(hasCustomMessage(""), false);
  assert.equal(hasCustomMessage("   "), false);
  assert.equal(hasCustomMessage(null), false);
  assert.equal(hasCustomMessage(undefined), false);
});
