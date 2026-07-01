import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyNotification } from "./notification-key.js";

test("classifyNotification: primer aviso es FIRST_ASSIGNMENT único", () => {
  const c = classifyNotification("INITIAL_NOTICE");
  assert.equal(c.type, "FIRST_ASSIGNMENT");
  assert.equal(c.key, "FIRST_ASSIGNMENT");
});

test("classifyNotification: cada recordatorio tiene clave distinta", () => {
  assert.deepEqual(classifyNotification("SEVEN_DAYS_BEFORE"), { type: "REMINDER", key: "REMINDER_7_DAYS" });
  assert.deepEqual(classifyNotification("THREE_DAYS_BEFORE"), { type: "REMINDER", key: "REMINDER_3_DAYS" });
  assert.deepEqual(classifyNotification("ONE_DAY_BEFORE"), { type: "REMINDER", key: "REMINDER_1_DAY" });
  assert.deepEqual(classifyNotification("SAME_DAY"), { type: "REMINDER", key: "REMINDER_SAME_DAY" });
});

/**
 * Simula el unique [assignmentId, recipientPersonId, notificationKey] de
 * NotificationLog para demostrar el comportamiento de deduplicación:
 *  - FIRST_ASSIGNMENT no se duplica.
 *  - Se permiten varios recordatorios (claves distintas) para la misma
 *    asignación/persona.
 */
function simulateNotificationLog() {
  const seen = new Set<string>();
  return {
    tryInsert(assignmentId: string, person: string, reminderType: string): boolean {
      const { key } = classifyNotification(reminderType);
      const uk = `${assignmentId}|${person}|${key}`;
      if (seen.has(uk)) return false; // violaría el unique → no se reenvía
      seen.add(uk);
      return true;
    },
    get size() {
      return seen.size;
    },
  };
}

test("NotificationLog: no duplica FIRST_ASSIGNMENT y permite múltiples recordatorios", () => {
  const log = simulateNotificationLog();
  const a = "assign-1";
  const p = "person-1";

  // Primer aviso: primer intento pasa, el segundo se bloquea.
  assert.equal(log.tryInsert(a, p, "INITIAL_NOTICE"), true);
  assert.equal(log.tryInsert(a, p, "INITIAL_NOTICE"), false);

  // Varios recordatorios distintos: todos pasan.
  assert.equal(log.tryInsert(a, p, "THREE_DAYS_BEFORE"), true);
  assert.equal(log.tryInsert(a, p, "ONE_DAY_BEFORE"), true);
  assert.equal(log.tryInsert(a, p, "SAME_DAY"), true);

  // Repetir un recordatorio ya enviado se bloquea (no duplica).
  assert.equal(log.tryInsert(a, p, "THREE_DAYS_BEFORE"), false);

  // Total: FIRST_ASSIGNMENT + 3 recordatorios distintos = 4 registros.
  assert.equal(log.size, 4);

  // Otra persona (acompañante) recibe sus propios registros sin chocar.
  assert.equal(log.tryInsert(a, "person-2", "INITIAL_NOTICE"), true);
  assert.equal(log.size, 5);
});
