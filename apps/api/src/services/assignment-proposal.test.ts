import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAssignmentProposal, ProposalPublisher } from "./assignment-proposal.js";

function pub(id: string, name: string, over: Partial<ProposalPublisher> = {}): ProposalPublisher {
  return {
    id,
    fullName: name,
    isActive: true,
    deletedAt: null,
    canReceiveAssignments: true,
    canBeCompanion: true,
    ...over,
  };
}

const oneWeek = (weekId = "w1") => [{ weekId, existingNumbers: [], existingPublisherIds: [] }];
const emptyHistory = { assignedCount: {}, pairCount: {} };

test("excluye publicadores inactivos, no elegibles y borrados", () => {
  const publishers = [
    pub("a", "Ana"),
    pub("b", "Beto"),
    pub("c", "Caro", { isActive: false }),
    pub("d", "Dani", { canReceiveAssignments: false }),
    pub("e", "Eva", { deletedAt: new Date() }),
  ];
  const { assignments } = buildAssignmentProposal({ weeks: oneWeek(), publishers, history: emptyHistory });
  const usedIds = new Set(assignments.flatMap((x) => [x.assignedPublisherId, x.companionPublisherId].filter(Boolean) as string[]));
  assert.ok(!usedIds.has("c"), "inactivo no debe usarse");
  assert.ok(!usedIds.has("d"), "no-recibe-asignaciones no debe ser asignado");
  assert.ok(!usedIds.has("e"), "borrado no debe usarse");
});

test("no usa como acompanante a quien canBeCompanion=false", () => {
  // Only 2 can-companion people; one extra can't be companion.
  const publishers = [pub("a", "Ana"), pub("b", "Beto"), pub("c", "Caro", { canBeCompanion: false })];
  const { assignments } = buildAssignmentProposal({ weeks: oneWeek(), publishers, history: emptyHistory });
  const companionIds = assignments.map((x) => x.companionPublisherId).filter(Boolean);
  assert.ok(!companionIds.includes("c"), "c no puede ser acompanante");
});

test("Lectura de la Biblia es individual (sin acompanante)", () => {
  const publishers = [pub("a", "Ana"), pub("b", "Beto"), pub("c", "Caro"), pub("d", "Dani")];
  const { assignments } = buildAssignmentProposal({ weeks: oneWeek(), publishers, history: emptyHistory });
  const reading = assignments.find((x) => x.assignmentNumber === 1);
  assert.equal(reading?.companionPublisherId, null);
});

test("Lectura de la Biblia se asigna solo a hombres cuando hay genero", () => {
  const publishers = [
    pub("f1", "Fem1", { gender: "FEMALE" }),
    pub("f2", "Fem2", { gender: "FEMALE" }),
    pub("m1", "Masc1", { gender: "MALE" }),
    pub("m2", "Masc2", { gender: "MALE" }),
    pub("m3", "Masc3", { gender: "MALE" }),
    pub("f3", "Fem3", { gender: "FEMALE" }),
  ];
  const byId = new Map(publishers.map((p) => [p.id, p]));
  const { assignments } = buildAssignmentProposal({ weeks: oneWeek(), publishers, history: emptyHistory });
  const reading = assignments.find((x) => x.assignmentNumber === 1)!;
  assert.equal(byId.get(reading.assignedPublisherId)?.gender, "MALE", "la Lectura debe recaer en un hombre");
});

test("el acompanante de partes de estudiante es del mismo genero que el asignado", () => {
  const publishers = [
    pub("m1", "Masc1", { gender: "MALE" }),
    pub("m2", "Masc2", { gender: "MALE" }),
    pub("m3", "Masc3", { gender: "MALE" }),
    pub("f1", "Fem1", { gender: "FEMALE" }),
    pub("f2", "Fem2", { gender: "FEMALE" }),
    pub("f3", "Fem3", { gender: "FEMALE" }),
    pub("m4", "Masc4", { gender: "MALE" }),
    pub("f4", "Fem4", { gender: "FEMALE" }),
  ];
  const byId = new Map(publishers.map((p) => [p.id, p]));
  const { assignments } = buildAssignmentProposal({ weeks: oneWeek(), publishers, history: emptyHistory });
  for (const a of assignments) {
    if (a.assignmentNumber === 1) continue; // reading is individual + male-only
    if (a.companionPublisherId) {
      assert.equal(
        byId.get(a.companionPublisherId)?.gender,
        byId.get(a.assignedPublisherId)?.gender,
        `el acompanante de "${a.title}" debe ser del mismo genero`,
      );
    }
  }
});

test("no repite la misma persona dos veces en la semana cuando hay suficientes", () => {
  // 4 slots: 1 individual + 3 with companion = 7 person-slots. Need >=7 distinct people to avoid reuse.
  const publishers = Array.from({ length: 8 }, (_, i) => pub(`p${i}`, `Pub${i}`));
  const { assignments, warnings } = buildAssignmentProposal({ weeks: oneWeek(), publishers, history: emptyHistory });
  const ids = assignments.flatMap((x) => [x.assignedPublisherId, x.companionPublisherId].filter(Boolean) as string[]);
  assert.equal(new Set(ids).size, ids.length, "no debe repetir personas en la semana");
  assert.equal(warnings.length, 0);
});

test("distribuye de forma equilibrada entre semanas", () => {
  const publishers = Array.from({ length: 8 }, (_, i) => pub(`p${i}`, `Pub${i}`));
  const weeks = Array.from({ length: 4 }, (_, i) => ({ weekId: `w${i}`, existingNumbers: [], existingPublisherIds: [] }));
  const { assignments } = buildAssignmentProposal({ weeks, publishers, history: emptyHistory });
  const counts: Record<string, number> = {};
  for (const a of assignments) {
    counts[a.assignedPublisherId] = (counts[a.assignedPublisherId] || 0) + 1;
    if (a.companionPublisherId) counts[a.companionPublisherId] = (counts[a.companionPublisherId] || 0) + 1;
  }
  const values = Object.values(counts);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // With balanced scoring the spread between most- and least-used should be small.
  assert.ok(max - min <= 1, `distribucion no equilibrada: min=${min} max=${max}`);
});

test("considera historial previo: prioriza a quien tiene menos asignaciones", () => {
  const publishers = [pub("a", "Ana"), pub("b", "Beto"), pub("c", "Caro")];
  // Ana has a heavy history; first individual slot should not pick Ana.
  const history = { assignedCount: { a: 100 }, pairCount: {} };
  const { assignments } = buildAssignmentProposal({ weeks: oneWeek(), publishers, history });
  const reading = assignments.find((x) => x.assignmentNumber === 1);
  assert.notEqual(reading?.assignedPublisherId, "a", "no debe elegir al de mayor historial primero");
});

test("respeta existingNumbers (no duplica slots ya presentes)", () => {
  const publishers = Array.from({ length: 8 }, (_, i) => pub(`p${i}`, `Pub${i}`));
  const weeks = [{ weekId: "w1", existingNumbers: [1, 2], existingPublisherIds: [] }];
  const { assignments } = buildAssignmentProposal({ weeks, publishers, history: emptyHistory });
  const numbers = assignments.map((x) => x.assignmentNumber).sort();
  assert.deepEqual(numbers, [3, 4], "solo debe proponer los slots faltantes");
});

test("evita repetir pareja frecuente cuando hay alternativa", () => {
  // a always assigned (heavy others) ; b is the frequent pair, c is alternative with same base.
  const publishers = [pub("a", "Ana"), pub("b", "Beto"), pub("c", "Caro")];
  const history = { assignedCount: {}, pairCount: { [["a", "b"].sort().join("|")]: 50 } };
  const weeks = [{ weekId: "w1", existingNumbers: [1, 3, 4], existingPublisherIds: [] }]; // only slot 2 (needs companion)
  const { assignments } = buildAssignmentProposal({ weeks, publishers, history });
  const slot2 = assignments.find((x) => x.assignmentNumber === 2)!;
  // assigned is the lowest-score; companion should avoid the frequent pair if the assigned is 'a'.
  if (slot2.assignedPublisherId === "a") {
    assert.notEqual(slot2.companionPublisherId, "b", "debe evitar la pareja frecuente a-b");
  }
});

test("no favorece siempre al primer registro/alfabetico: el lector varia entre semanas", () => {
  // Alphabetically-ordered names; with empty history all base scores tie.
  // The old bug picked the alphabetically-first name ("Aaron") every time.
  const publishers = Array.from({ length: 6 }, (_, i) =>
    pub(`p${i}`, `${String.fromCharCode(65 + i)}aron${i}`, { gender: "MALE" }),
  );
  const readers = new Set<string>();
  for (let i = 0; i < 25; i += 1) {
    // Independent single-week generations with distinct weekIds (fresh state each).
    const { assignments } = buildAssignmentProposal({
      weeks: [{ weekId: `week-${i}-xyz`, existingNumbers: [], existingPublisherIds: [] }],
      publishers,
      history: emptyHistory,
    });
    const reading = assignments.find((x) => x.assignmentNumber === 1)!;
    readers.add(reading.assignedPublisherId);
  }
  assert.ok(readers.size >= 3, `el lector deberia variar entre semanas, distintos=${readers.size}`);
});

test("regenerar con otra semilla produce una distribucion distinta", () => {
  const publishers = Array.from({ length: 6 }, (_, i) => pub(`p${i}`, `Pub${i}`, { gender: "MALE" }));
  const week = () => [{ weekId: "w1", existingNumbers: [], existingPublisherIds: [] }];
  const run = (seed?: number) =>
    buildAssignmentProposal({ weeks: week(), publishers, history: emptyHistory, options: seed != null ? { seed } : {} })
      .assignments.map((a) => `${a.assignmentNumber}:${a.assignedPublisherId}`)
      .join(",");
  const a = run(1);
  const b = run(999999);
  assert.notEqual(a, b, "distintas semillas deberian reordenar la distribucion");
});

test("NUNCA asigna una mujer a Lectura de la Biblia: si no hay hombres, la deja sin asignar", () => {
  // Only women available. Bible Reading (slot 1) must be left UNASSIGNED, never a woman.
  const publishers = [
    pub("f1", "Fem1", { gender: "FEMALE" }),
    pub("f2", "Fem2", { gender: "FEMALE" }),
    pub("f3", "Fem3", { gender: "FEMALE" }),
    pub("f4", "Fem4", { gender: "FEMALE" }),
  ];
  const { assignments, warnings } = buildAssignmentProposal({ weeks: oneWeek(), publishers, history: emptyHistory });
  const reading = assignments.find((x) => x.assignmentNumber === 1);
  assert.equal(reading, undefined, "la Lectura no debe crearse si no hay hombres");
  assert.ok(
    warnings.some((w) => /genero requerido/i.test(w) && /sin asignar/i.test(w)),
    "debe advertir que se dejo sin asignar por falta de hombres",
  );
  // Student parts (no gender restriction) are still assigned to the available women.
  const studentParts = assignments.filter((x) => x.assignmentNumber !== 1);
  assert.ok(studentParts.length > 0, "las partes sin restriccion de genero si se asignan");
});

test("todas las Lecturas del mes quedan con hombres cuando hay hombres suficientes", () => {
  const publishers = [
    pub("m1", "M1", { gender: "MALE" }),
    pub("m2", "M2", { gender: "MALE" }),
    pub("m3", "M3", { gender: "MALE" }),
    pub("m4", "M4", { gender: "MALE" }),
    pub("f1", "F1", { gender: "FEMALE" }),
    pub("f2", "F2", { gender: "FEMALE" }),
    pub("f3", "F3", { gender: "FEMALE" }),
    pub("f4", "F4", { gender: "FEMALE" }),
  ];
  const byId = new Map(publishers.map((p) => [p.id, p]));
  const weeks = Array.from({ length: 4 }, (_, i) => ({ weekId: `w${i}`, existingNumbers: [], existingPublisherIds: [] }));
  const { assignments } = buildAssignmentProposal({ weeks, publishers, history: emptyHistory });
  const readings = assignments.filter((x) => x.assignmentNumber === 1);
  assert.equal(readings.length, 4, "una lectura por semana");
  for (const r of readings) {
    assert.equal(byId.get(r.assignedPublisherId)?.gender, "MALE", "toda lectura debe recaer en un hombre");
  }
  // Women do receive valid (student) assignments.
  const womenUsed = assignments.some((a) => byId.get(a.assignedPublisherId)?.gender === "FEMALE");
  assert.ok(womenUsed, "las mujeres reciben asignaciones validas de Seamos mejores maestros");
});
