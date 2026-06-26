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
