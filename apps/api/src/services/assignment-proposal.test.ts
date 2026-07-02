import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAssignmentProposal, autofillOpeningPartsFromChairman, ProposalPublisher } from "./assignment-proposal.js";

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



// ─── Regla mensual: un siervo ministerial preside una vez al mes ───

const CHAIRMAN_SLOT = {
  assignmentNumber: 1,
  section: "OPENING" as const,
  assignmentType: "CHAIRMAN",
  title: "Presidente de la reunión",
  room: "MAIN" as const,
  needsCompanion: false,
};

function chairmanWeeks(ids: string[]) {
  return ids.map((weekId) => ({ weekId, existingNumbers: [], existingPublisherIds: [], slots: [CHAIRMAN_SLOT] }));
}

test("SM mensual: al menos una semana la preside un siervo ministerial", () => {
  const publishers = [
    pub("elder1", "Elder Uno", { gender: "MALE", appointment: "ELDER", canBeChairman: true }),
    pub("elder2", "Elder Dos", { gender: "MALE", appointment: "ELDER", canBeChairman: true }),
    pub("ms1", "Siervo Uno", { gender: "MALE", appointment: "MINISTERIAL_SERVANT", canBeChairman: true }),
  ];
  for (let seed = 0; seed < 6; seed++) {
    const { assignments, warnings } = buildAssignmentProposal({
      weeks: chairmanWeeks(["w1", "w2", "w3", "w4"]),
      publishers,
      history: emptyHistory,
      options: { seed },
    });
    const chairs = assignments.filter((a) => a.assignmentType === "CHAIRMAN");
    assert.equal(chairs.length, 4);
    assert.ok(chairs.some((a) => a.assignedPublisherId === "ms1"), `seed ${seed}: un siervo ministerial debe presidir`);
    assert.ok(!warnings.some((w) => w.includes("siervo ministerial")), "no debe advertir cuando hay SM elegible");
  }
});

test("SM mensual: si no hay siervo ministerial elegible, se advierte y quedan ancianos", () => {
  const publishers = [
    pub("elder1", "Elder Uno", { gender: "MALE", appointment: "ELDER", canBeChairman: true }),
    pub("elder2", "Elder Dos", { gender: "MALE", appointment: "ELDER", canBeChairman: true }),
  ];
  const { assignments, warnings } = buildAssignmentProposal({
    weeks: chairmanWeeks(["w1", "w2", "w3"]),
    publishers,
    history: emptyHistory,
  });
  const chairs = assignments.filter((a) => a.assignmentType === "CHAIRMAN");
  assert.ok(chairs.length > 0);
  assert.ok(chairs.every((a) => ["elder1", "elder2"].includes(a.assignedPublisherId)));
  assert.ok(warnings.some((w) => w.toLowerCase().includes("siervo ministerial")), "debe advertir la ausencia de SM");
});

test("SM mensual: un siervo ministerial sin capacidad de presidente NO cuenta (advierte)", () => {
  const publishers = [
    pub("elder1", "Elder Uno", { gender: "MALE", appointment: "ELDER", canBeChairman: true }),
    // Siervo ministerial pero sin capacidad de presidente -> no elegible para presidir.
    pub("ms0", "Siervo Sin Cap", { gender: "MALE", appointment: "MINISTERIAL_SERVANT", canBeChairman: false }),
  ];
  const { assignments, warnings } = buildAssignmentProposal({
    weeks: chairmanWeeks(["w1", "w2"]),
    publishers,
    history: emptyHistory,
  });
  const chairs = assignments.filter((a) => a.assignmentType === "CHAIRMAN");
  assert.ok(chairs.every((a) => a.assignedPublisherId === "elder1"));
  assert.ok(!chairs.some((a) => a.assignedPublisherId === "ms0"), "un SM sin capacidad no debe presidir");
  assert.ok(warnings.some((w) => w.toLowerCase().includes("siervo ministerial")));
});

test("SM mensual: si un siervo ministerial ya preside, no se altera", () => {
  // Un solo siervo ministerial elegible: presidirá todas por ser el único con capacidad.
  const publishers = [
    pub("ms1", "Siervo Uno", { gender: "MALE", appointment: "MINISTERIAL_SERVANT", canBeChairman: true }),
  ];
  const { assignments, warnings } = buildAssignmentProposal({
    weeks: chairmanWeeks(["w1", "w2"]),
    publishers,
    history: emptyHistory,
  });
  const chairs = assignments.filter((a) => a.assignmentType === "CHAIRMAN");
  assert.ok(chairs.every((a) => a.assignedPublisherId === "ms1"));
  assert.ok(!warnings.some((w) => w.includes("siervo ministerial")));
});

// ─── Inicio de reunión: autocompletado desde el presidente ───────────────────

const openingSlots = [
  { assignmentNumber: 1, section: "OPENING" as const, assignmentType: "CHAIRMAN", title: "Presidente", room: "MAIN" as const, needsCompanion: false },
  { assignmentNumber: 2, section: "OPENING" as const, assignmentType: "OPENING_PRAYER", title: "Oración inicial", room: "MAIN" as const, needsCompanion: false },
  { assignmentNumber: 3, section: "OPENING" as const, assignmentType: "OPENING_COMMENTS", title: "Palabras de introducción", durationMinutes: 1, room: "MAIN" as const, needsCompanion: false },
  { assignmentNumber: 4, section: "CONCLUSION" as const, assignmentType: "CLOSING_PRAYER", title: "Oración final", room: "MAIN" as const, needsCompanion: false },
];

test("oración inicial y palabras de introducción se autocompletan con el presidente; oración final independiente", () => {
  const publishers = Array.from({ length: 5 }, (_, i) =>
    pub(`m${i}`, `Masc${i}`, { gender: "MALE", canBeChairman: true, appointment: "ELDER" }),
  );
  const { assignments } = buildAssignmentProposal({
    weeks: [{ weekId: "w1", existingNumbers: [], existingPublisherIds: [], slots: openingSlots }],
    publishers,
    history: emptyHistory,
  });
  const chair = assignments.find((a) => a.assignmentType === "CHAIRMAN")!;
  const prayer = assignments.find((a) => a.assignmentType === "OPENING_PRAYER")!;
  const comments = assignments.find((a) => a.assignmentType === "OPENING_COMMENTS")!;
  const closing = assignments.find((a) => a.assignmentType === "CLOSING_PRAYER")!;
  assert.equal(prayer.assignedPublisherId, chair.assignedPublisherId, "oración inicial = presidente");
  assert.equal(comments.assignedPublisherId, chair.assignedPublisherId, "palabras de introducción = presidente");
  assert.equal(prayer.companionPublisherId, null);
  // Con 5 hombres distintos, la oración final NO queda atada al presidente.
  assert.notEqual(closing.assignedPublisherId, chair.assignedPublisherId, "oración final es independiente");
});

test("autofillOpeningPartsFromChairman alinea solo inicio, respeta oración final", () => {
  const assignments = [
    { weekId: "w1", assignmentNumber: 1, section: "OPENING" as const, assignmentType: "CHAIRMAN", title: "Presidente", room: "MAIN" as const, assignedPublisherId: "chair", companionPublisherId: null },
    { weekId: "w1", assignmentNumber: 2, section: "OPENING" as const, assignmentType: "OPENING_PRAYER", title: "Oración inicial", room: "MAIN" as const, assignedPublisherId: "otro1", companionPublisherId: null },
    { weekId: "w1", assignmentNumber: 3, section: "OPENING" as const, assignmentType: "OPENING_COMMENTS", title: "Palabras de introducción", room: "MAIN" as const, assignedPublisherId: "otro2", companionPublisherId: null },
    { weekId: "w1", assignmentNumber: 4, section: "CONCLUSION" as const, assignmentType: "CLOSING_PRAYER", title: "Oración final", room: "MAIN" as const, assignedPublisherId: "otro3", companionPublisherId: null },
  ];
  autofillOpeningPartsFromChairman(assignments);
  assert.equal(assignments[1].assignedPublisherId, "chair");
  assert.equal(assignments[2].assignedPublisherId, "chair");
  assert.equal(assignments[3].assignedPublisherId, "otro3", "la oración final no se toca");
});


// ─── Estudio Bíblico de la Congregación: lector ──────────────────────────────

const cbsSlots = [
  { assignmentNumber: 1, section: "LIVING_AS_CHRISTIANS" as const, assignmentType: "CONGREGATION_BIBLE_STUDY_CONDUCTOR", title: "Estudio bíblico de la congregación", room: "MAIN" as const, needsCompanion: false },
  { assignmentNumber: 2, section: "LIVING_AS_CHRISTIANS" as const, assignmentType: "CONGREGATION_BIBLE_STUDY_READER", title: "Lector del estudio bíblico", room: "MAIN" as const, needsCompanion: false },
];

test("el lector del EBC solo se elige entre publicadores con canReadCBS", () => {
  const publishers = [
    pub("cond", "Conductor", { gender: "MALE", canConductCBS: true, canReadCBS: false }),
    pub("r1", "Lector1", { gender: "MALE", canConductCBS: false, canReadCBS: true }),
    pub("r2", "Lector2", { gender: "MALE", canConductCBS: false, canReadCBS: true }),
    pub("x", "SinCap", { gender: "MALE", canConductCBS: false, canReadCBS: false }),
    pub("f", "Fem", { gender: "FEMALE", canReadCBS: false }),
  ];
  const { assignments } = buildAssignmentProposal({
    weeks: [{ weekId: "w1", existingNumbers: [], existingPublisherIds: [], slots: cbsSlots }],
    publishers,
    history: emptyHistory,
  });
  const reader = assignments.find((a) => a.assignmentType === "CONGREGATION_BIBLE_STUDY_READER")!;
  assert.ok(reader, "debe existir asignación de lector");
  assert.ok(["r1", "r2"].includes(reader.assignedPublisherId), "el lector debe tener canReadCBS");
});

test("si no hay lector elegible, el EBC queda sin lector y se avisa", () => {
  const publishers = [
    pub("cond", "Conductor", { gender: "MALE", canConductCBS: true, canReadCBS: false }),
    pub("x", "SinCap", { gender: "MALE", canReadCBS: false }),
  ];
  const { assignments, warnings } = buildAssignmentProposal({
    weeks: [{ weekId: "w1", existingNumbers: [], existingPublisherIds: [], slots: cbsSlots }],
    publishers,
    history: emptyHistory,
  });
  const reader = assignments.find((a) => a.assignmentType === "CONGREGATION_BIBLE_STUDY_READER");
  assert.equal(reader, undefined, "sin candidatos no se asigna lector");
  assert.ok(warnings.some((w) => w.toLowerCase().includes("lector") || w.includes("Lector")), "debe advertir sobre el lector");
});
