import { test } from "node:test";
import assert from "node:assert/strict";
import { groupKey, groupDeliveries, type GroupableDelivery } from "@jw-reminders/shared";

/** Helper para construir un delivery agrupable mínimo. */
function d(
  id: string,
  publisherId: string,
  meetingWeekId: string,
  reminderType: string,
): GroupableDelivery & { id: string } {
  return { id, publisherId, reminderType, assignment: { meetingWeekId } };
}

test("groupKey combina persona + semana + tipo de recordatorio", () => {
  assert.equal(
    groupKey(d("x", "pub1", "week1", "DAY_BEFORE")),
    "pub1|week1|DAY_BEFORE",
  );
});

test("misma persona + misma semana + mismo bucket => un solo grupo", () => {
  const deliveries = [
    d("a", "pub1", "week1", "DAY_BEFORE"),
    d("b", "pub1", "week1", "DAY_BEFORE"),
    d("c", "pub1", "week1", "DAY_BEFORE"),
  ];
  const groups = groupDeliveries(deliveries);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((x) => x.id), ["a", "b", "c"]);
});

test("distinto bucket (reminderType) => grupos separados", () => {
  const groups = groupDeliveries([
    d("a", "pub1", "week1", "DAY_BEFORE"),
    d("b", "pub1", "week1", "SAME_DAY"),
  ]);
  assert.equal(groups.length, 2);
});

test("distinta semana => grupos separados", () => {
  const groups = groupDeliveries([
    d("a", "pub1", "week1", "DAY_BEFORE"),
    d("b", "pub1", "week2", "DAY_BEFORE"),
  ]);
  assert.equal(groups.length, 2);
});

test("distinta persona => grupos separados", () => {
  const groups = groupDeliveries([
    d("a", "pub1", "week1", "DAY_BEFORE"),
    d("b", "pub2", "week1", "DAY_BEFORE"),
  ]);
  assert.equal(groups.length, 2);
});

test("agrupación estable: preserva el orden de aparición del primer miembro", () => {
  const groups = groupDeliveries([
    d("a", "pub2", "week1", "DAY_BEFORE"), // grupo A (aparece primero)
    d("b", "pub1", "week1", "DAY_BEFORE"), // grupo B
    d("c", "pub2", "week1", "DAY_BEFORE"), // grupo A
    d("d", "pub1", "week1", "DAY_BEFORE"), // grupo B
  ]);
  assert.equal(groups.length, 2);
  // El primer grupo debe ser el de "a" (pub2), el segundo el de "b" (pub1).
  assert.deepEqual(groups[0].map((x) => x.id), ["a", "c"]);
  assert.deepEqual(groups[1].map((x) => x.id), ["b", "d"]);
});

test("lote vacío => sin grupos", () => {
  assert.deepEqual(groupDeliveries([]), []);
});

test("una persona con una sola parte => grupo de tamaño 1 (degenera a envío individual)", () => {
  const groups = groupDeliveries([d("a", "pub1", "week1", "INITIAL")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 1);
});

test("presidente + oración inicial + palabras de introducción de la misma persona/semana forman UN grupo", () => {
  const deliveries = [
    d("d1", "chair", "w1", "DAY_BEFORE"), // Presidente
    d("d2", "chair", "w1", "DAY_BEFORE"), // Oración inicial
    d("d3", "chair", "w1", "DAY_BEFORE"), // Palabras de introducción
    d("d4", "otra", "w1", "DAY_BEFORE"), // otra persona
  ];
  const groups = groupDeliveries(deliveries);
  const chairGroup = groups.find((g) => g[0].publisherId === "chair")!;
  assert.equal(chairGroup.length, 3, "las 3 partes del presidente van en un solo mensaje");
  assert.equal(groups.length, 2, "el presidente y la otra persona son grupos distintos");
});
