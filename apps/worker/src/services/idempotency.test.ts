import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIdempotencyKey, contentHash } from "@jw-reminders/shared/whatsapp";

test("buildIdempotencyKey es determinista (mismos datos ⇒ misma clave)", () => {
  const a = buildIdempotencyKey({ deliveryIds: ["d1", "d2"], phone: "5219611234567", message: "Hola" });
  const b = buildIdempotencyKey({ deliveryIds: ["d1", "d2"], phone: "5219611234567", message: "Hola" });
  assert.equal(a, b);
});

test("buildIdempotencyKey es independiente del ORDEN de los deliveryIds", () => {
  const a = buildIdempotencyKey({ deliveryIds: ["d1", "d2", "d3"], phone: "52961", message: "x" });
  const b = buildIdempotencyKey({ deliveryIds: ["d3", "d1", "d2"], phone: "52961", message: "x" });
  assert.equal(a, b, "el orden del grupo no debe cambiar la clave");
});

test("un reintento del MISMO grupo con el MISMO contenido produce la MISMA clave (dedup)", () => {
  const intento1 = buildIdempotencyKey({ deliveryIds: ["g1"], phone: "52961", message: "Recordatorio" });
  const intento2 = buildIdempotencyKey({ deliveryIds: ["g1"], phone: "52961", message: "Recordatorio" });
  assert.equal(intento1, intento2);
});

test("cambiar el contenido cambia la clave (mensaje editado ⇒ se envía)", () => {
  const a = buildIdempotencyKey({ deliveryIds: ["d1"], phone: "52961", message: "Original" });
  const b = buildIdempotencyKey({ deliveryIds: ["d1"], phone: "52961", message: "Editado" });
  assert.notEqual(a, b);
});

test("cambiar el teléfono cambia la clave", () => {
  const a = buildIdempotencyKey({ deliveryIds: ["d1"], phone: "52961", message: "m" });
  const b = buildIdempotencyKey({ deliveryIds: ["d1"], phone: "52962", message: "m" });
  assert.notEqual(a, b);
});

test("contentHash es estable y distingue contenidos", () => {
  assert.equal(contentHash("abc"), contentHash("abc"));
  assert.notEqual(contentHash("abc"), contentHash("abd"));
});
