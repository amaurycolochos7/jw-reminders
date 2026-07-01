import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAssignmentProposal,
  ProposalPublisher,
  ProposalSlot,
} from "./assignment-proposal.js";

/**
 * Fase 2: el generador debe filtrar por CAPACIDADES reales, no solo por género.
 * Dataset representativo:
 *  - hombres nombrados / no nombrados / no bautizados
 *  - mujeres precursoras / publicadoras
 *  - inactivos
 *  - personas sin capacidad de acompañante
 *  - un hombre sin capacidad de lectura (canBibleReading=false)
 */
function pub(id: string, over: Partial<ProposalPublisher> = {}): ProposalPublisher {
  return {
    id,
    fullName: id,
    isActive: true,
    deletedAt: null,
    canReceiveAssignments: true,
    canBeCompanion: true,
    canParticipateSMM: true,
    canBibleReading: false,
    canGiveTalk: false,
    ...over,
  };
}

const DATASET: ProposalPublisher[] = [
  // Anciano (nombrado): puede todo.
  pub("elder", { gender: "MALE", canBibleReading: true, canGiveTalk: true }),
  // Hombre bautizado sin nombramiento.
  pub("manBap", { gender: "MALE", canBibleReading: true, canGiveTalk: true }),
  // Hombre no bautizado: lectura sí, discurso no.
  pub("manUnbap", { gender: "MALE", canBibleReading: true, canGiveTalk: false }),
  // Hombre SIN capacidad de lectura (no puede lectura ni discurso).
  pub("manNoRead", { gender: "MALE", canBibleReading: false, canGiveTalk: false }),
  // Mujer precursora.
  pub("womanPio", { gender: "FEMALE", canBibleReading: false, canGiveTalk: false }),
  // Mujer publicadora.
  pub("womanPub", { gender: "FEMALE", canBibleReading: false, canGiveTalk: false }),
  // Inactivo.
  pub("inactive", { gender: "MALE", isActive: false, canBibleReading: true, canGiveTalk: true }),
  // Sin capacidad de acompañante.
  pub("noComp", { gender: "FEMALE", canBeCompanion: false }),
];

const HISTORY = { assignedCount: {}, pairCount: {} };
const week = (weekId = "w1", slots?: ProposalSlot[]) => [{ weekId, existingNumbers: [], existingPublisherIds: [], slots }];

const READING: ProposalSlot = { assignmentNumber: 1, section: "BIBLE_READING", assignmentType: "BIBLE_READING", title: "Lectura", room: "MAIN", needsCompanion: false };
const TALK: ProposalSlot = { assignmentNumber: 2, section: "APPLY_YOURSELF", assignmentType: "TALK", title: "Discurso", room: "MAIN", needsCompanion: false };
const STUDENT: ProposalSlot = { assignmentNumber: 3, section: "APPLY_YOURSELF", assignmentType: "START_CONVERSATION", title: "Conversacion", room: "MAIN", needsCompanion: true };

function idsFor(assignmentNumber: number, slots: ProposalSlot[]) {
  const { assignments } = buildAssignmentProposal({ weeks: week("w1", slots), publishers: DATASET, history: HISTORY });
  return assignments.find((a) => a.assignmentNumber === assignmentNumber);
}

test("Lectura: solo publicadores con canBibleReading=true (excluye mujeres y hombre sin capacidad)", () => {
  // Repetimos para varias semillas para no depender del desempate.
  for (let seed = 0; seed < 8; seed++) {
    const { assignments } = buildAssignmentProposal({ weeks: week("w1", [READING]), publishers: DATASET, history: HISTORY, options: { seed } });
    const reading = assignments.find((a) => a.assignmentNumber === 1);
    assert.ok(reading, "debe asignarse la lectura");
    assert.ok(["elder", "manBap", "manUnbap"].includes(reading!.assignedPublisherId), `lector inválido: ${reading!.assignedPublisherId}`);
    assert.ok(!["womanPio", "womanPub", "manNoRead", "inactive", "noComp"].includes(reading!.assignedPublisherId));
  }
});

test("Discurso: solo canGiveTalk=true (excluye no bautizado, mujeres y hombre sin capacidad)", () => {
  for (let seed = 0; seed < 8; seed++) {
    const { assignments } = buildAssignmentProposal({ weeks: week("w1", [TALK]), publishers: DATASET, history: HISTORY, options: { seed } });
    const talk = assignments.find((a) => a.assignmentNumber === 2);
    assert.ok(talk, "debe asignarse el discurso");
    assert.ok(["elder", "manBap"].includes(talk!.assignedPublisherId), `orador inválido: ${talk!.assignedPublisherId}`);
  }
});

test("Seamos Mejores Maestros: mujeres con canParticipateSMM sí participan", () => {
  // Con solo mujeres+SMM disponibles, el asignado principal debe poder ser mujer.
  const onlyWomen = [
    pub("w1", { gender: "FEMALE" }),
    pub("w2", { gender: "FEMALE" }),
    pub("w3", { gender: "FEMALE" }),
  ];
  const { assignments } = buildAssignmentProposal({ weeks: week("w1", [STUDENT]), publishers: onlyWomen, history: HISTORY });
  const student = assignments.find((a) => a.assignmentNumber === 3);
  assert.ok(student, "la parte de estudiante debe asignarse a una mujer");
  assert.ok(["w1", "w2", "w3"].includes(student!.assignedPublisherId));
});

test("SMM: excluye a quien tiene canParticipateSMM=false", () => {
  const people = [
    pub("ok1", { gender: "MALE", canParticipateSMM: true }),
    pub("ok2", { gender: "MALE", canParticipateSMM: true }),
    pub("no", { gender: "MALE", canParticipateSMM: false }),
  ];
  for (let seed = 0; seed < 6; seed++) {
    const { assignments } = buildAssignmentProposal({ weeks: week("w1", [STUDENT]), publishers: people, history: HISTORY, options: { seed } });
    const usedIds = new Set(assignments.flatMap((a) => [a.assignedPublisherId, a.companionPublisherId].filter(Boolean) as string[]));
    assert.ok(!usedIds.has("no"), "quien no participa en SMM no debe usarse");
  }
});

test("Acompañante: solo canBeCompanion=true", () => {
  const student = idsFor(3, [STUDENT]);
  assert.ok(student, "parte de estudiante presente");
  assert.notEqual(student!.companionPublisherId, "noComp");
});

test("mujeres NUNCA aparecen en lectura ni discurso (todas las semillas)", () => {
  for (let seed = 0; seed < 10; seed++) {
    const { assignments } = buildAssignmentProposal({ weeks: week("w1", [READING, TALK, STUDENT]), publishers: DATASET, history: HISTORY, options: { seed } });
    const reading = assignments.find((a) => a.assignmentNumber === 1);
    const talk = assignments.find((a) => a.assignmentNumber === 2);
    for (const womanId of ["womanPio", "womanPub", "noComp"]) {
      assert.notEqual(reading?.assignedPublisherId, womanId);
      assert.notEqual(talk?.assignedPublisherId, womanId);
    }
  }
});

test("inactivos nunca se seleccionan (ni siquiera si tienen capacidades)", () => {
  const { assignments } = buildAssignmentProposal({ weeks: week("w1", [READING, TALK, STUDENT]), publishers: DATASET, history: HISTORY });
  const usedIds = new Set(assignments.flatMap((a) => [a.assignedPublisherId, a.companionPublisherId].filter(Boolean) as string[]));
  assert.ok(!usedIds.has("inactive"));
});

test("distribución equilibrada: a lo largo de varias semanas se reparte la lectura entre los hombres capaces", () => {
  const weeks = ["w1", "w2", "w3", "w4", "w5", "w6"].map((weekId) => ({ weekId, existingNumbers: [], existingPublisherIds: [], slots: [READING] }));
  const { assignments } = buildAssignmentProposal({ weeks, publishers: DATASET, history: HISTORY });
  const counts: Record<string, number> = {};
  for (const a of assignments) counts[a.assignedPublisherId] = (counts[a.assignedPublisherId] || 0) + 1;
  // Solo 3 hombres pueden leer; con 6 semanas cada uno debería recibir ~2 y ninguno 0.
  for (const id of ["elder", "manBap", "manUnbap"]) {
    assert.ok((counts[id] || 0) >= 1, `${id} debería recibir al menos una lectura (equilibrio)`);
  }
  assert.equal(Object.keys(counts).every((id) => ["elder", "manBap", "manUnbap"].includes(id)), true, "solo hombres capaces reciben lectura");
});

test("no repite innecesariamente en la misma semana cuando hay suficientes personas", () => {
  const { assignments } = buildAssignmentProposal({ weeks: week("w1", [READING, TALK, STUDENT]), publishers: DATASET, history: HISTORY });
  const ids = assignments.flatMap((a) => [a.assignedPublisherId, a.companionPublisherId].filter(Boolean) as string[]);
  assert.equal(ids.length, new Set(ids).size, "no debe repetir persona en la semana habiendo alternativas");
});
