import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveSection,
  deriveTitle,
  deriveDurationMinutes,
  typeNeedsCompanion,
  isAssigneeGenderAllowed,
  isCompanionGenderAllowed,
  isPublisherEligibleForAssignment,
  requiredCapabilityForType,
  validateAssignmentGenders,
  typeHasNoDuration,
  isChairmanAutofillType,
} from "@jw-reminders/shared";

test("deriva seccion, titulo y duracion desde el tipo", () => {
  assert.equal(deriveSection("BIBLE_READING"), "BIBLE_READING");
  assert.equal(deriveSection("START_CONVERSATION"), "APPLY_YOURSELF");
  assert.equal(deriveTitle("MAKE_RETURN_VISIT"), "Haga revisitas");
  assert.equal(deriveDurationMinutes("BIBLE_READING"), 4);
});

test("necesidad de acompanante por tipo", () => {
  assert.equal(typeNeedsCompanion("BIBLE_READING"), false);
  assert.equal(typeNeedsCompanion("TALK"), false);
  assert.equal(typeNeedsCompanion("START_CONVERSATION"), true);
  assert.equal(typeNeedsCompanion("BIBLE_STUDY"), true);
});

test("Lectura y Discurso solo permiten hombres; desconocido no se bloquea", () => {
  assert.equal(isAssigneeGenderAllowed("BIBLE_READING", "MALE"), true);
  assert.equal(isAssigneeGenderAllowed("BIBLE_READING", "FEMALE"), false);
  assert.equal(isAssigneeGenderAllowed("TALK", "FEMALE"), false);
  assert.equal(isAssigneeGenderAllowed("BIBLE_READING", null), true, "genero desconocido no bloquea");
  assert.equal(isAssigneeGenderAllowed("START_CONVERSATION", "FEMALE"), true);
});

test("acompanante mismo genero en partes de estudiante", () => {
  assert.equal(isCompanionGenderAllowed("START_CONVERSATION", "MALE", "MALE"), true);
  assert.equal(isCompanionGenderAllowed("START_CONVERSATION", "MALE", "FEMALE"), false);
  assert.equal(isCompanionGenderAllowed("START_CONVERSATION", "MALE", null), true, "desconocido no bloquea");
  assert.equal(isCompanionGenderAllowed("BIBLE_READING", "MALE", "FEMALE"), true, "no aplica a lectura");
});

test("validateAssignmentGenders devuelve mensaje claro o null", () => {
  assert.equal(validateAssignmentGenders({ assignmentType: "BIBLE_READING", assignedGender: "MALE" }), null);
  assert.match(
    validateAssignmentGenders({ assignmentType: "BIBLE_READING", assignedGender: "FEMALE" }) || "",
    /solo puede asignarse a hombres/,
  );
  assert.match(
    validateAssignmentGenders({ assignmentType: "BIBLE_STUDY", assignedGender: "MALE", companionGender: "FEMALE" }) || "",
    /mismo género/,
  );
  assert.equal(
    validateAssignmentGenders({ assignmentType: "BIBLE_STUDY", assignedGender: "FEMALE", companionGender: "FEMALE" }),
    null,
  );
});

test("isPublisherEligibleForAssignment: mujer no es elegible para Lectura ni Discurso", () => {
  const woman = { isActive: true, deletedAt: null, canReceiveAssignments: true, canBeCompanion: true, gender: "FEMALE" as const };
  assert.equal(isPublisherEligibleForAssignment(woman, "BIBLE_READING", "ASSIGNEE"), false);
  assert.equal(isPublisherEligibleForAssignment(woman, "TALK", "ASSIGNEE"), false);
  // Sí es elegible para partes de estudiante.
  assert.equal(isPublisherEligibleForAssignment(woman, "START_CONVERSATION", "ASSIGNEE"), true);
});

test("isPublisherEligibleForAssignment: hombre activo es elegible para Lectura y Discurso", () => {
  const man = { isActive: true, deletedAt: null, canReceiveAssignments: true, canBeCompanion: true, gender: "MALE" as const };
  assert.equal(isPublisherEligibleForAssignment(man, "BIBLE_READING", "ASSIGNEE"), true);
  assert.equal(isPublisherEligibleForAssignment(man, "TALK", "ASSIGNEE"), true);
});

test("isPublisherEligibleForAssignment: inactivo, borrado o sin permiso no es elegible", () => {
  const base = { canReceiveAssignments: true, canBeCompanion: true, gender: "MALE" as const };
  assert.equal(isPublisherEligibleForAssignment({ ...base, isActive: false, deletedAt: null }, "BIBLE_READING"), false);
  assert.equal(isPublisherEligibleForAssignment({ ...base, isActive: true, deletedAt: new Date() }, "BIBLE_READING"), false);
  assert.equal(
    isPublisherEligibleForAssignment({ isActive: true, deletedAt: null, canReceiveAssignments: false, canBeCompanion: true, gender: "MALE" }, "START_CONVERSATION"),
    false,
    "canReceiveAssignments=false no puede recibir nada",
  );
});

test("isPublisherEligibleForAssignment: acompanante requiere canBeCompanion", () => {
  const noCompanion = { isActive: true, deletedAt: null, canReceiveAssignments: true, canBeCompanion: false, gender: "MALE" as const };
  assert.equal(isPublisherEligibleForAssignment(noCompanion, "START_CONVERSATION", "COMPANION"), false);
  assert.equal(isPublisherEligibleForAssignment(noCompanion, "START_CONVERSATION", "ASSIGNEE"), true);
});



// ─── Fase 2: elegibilidad por capacidad ───

test("requiredCapabilityForType mapea tipos a capacidades", () => {
  assert.equal(requiredCapabilityForType("BIBLE_READING"), "canBibleReading");
  assert.equal(requiredCapabilityForType("TALK"), "canGiveTalk");
  assert.equal(requiredCapabilityForType("START_CONVERSATION"), "canParticipateSMM");
  assert.equal(requiredCapabilityForType("BIBLE_STUDY"), "canParticipateSMM");
  assert.equal(requiredCapabilityForType("OTHER"), null);
});

test("capacidad explícita en false bloquea aunque el género lo permitiera", () => {
  const man = { isActive: true, deletedAt: null, canReceiveAssignments: true, canBeCompanion: true, gender: "MALE" as const };
  assert.equal(isPublisherEligibleForAssignment({ ...man, canBibleReading: false }, "BIBLE_READING"), false);
  assert.equal(isPublisherEligibleForAssignment({ ...man, canGiveTalk: false }, "TALK"), false);
  assert.equal(isPublisherEligibleForAssignment({ ...man, canBibleReading: true }, "BIBLE_READING"), true);
});

test("capacidad undefined mantiene comportamiento legacy (solo género)", () => {
  const man = { isActive: true, deletedAt: null, canReceiveAssignments: true, canBeCompanion: true, gender: "MALE" as const };
  // Sin canBibleReading definido: no se bloquea por capacidad, sí por género (hombre pasa).
  assert.equal(isPublisherEligibleForAssignment(man, "BIBLE_READING"), true);
});

test("SMM: capacidad canParticipateSMM=false bloquea a asignado y acompañante", () => {
  const p = { isActive: true, deletedAt: null, canReceiveAssignments: true, canBeCompanion: true, gender: "MALE" as const, canParticipateSMM: false };
  assert.equal(isPublisherEligibleForAssignment(p, "START_CONVERSATION", "ASSIGNEE"), false);
  assert.equal(isPublisherEligibleForAssignment(p, "START_CONVERSATION", "COMPANION"), false);
});

test("mujer con canParticipateSMM sí es elegible para partes de estudiante", () => {
  const woman = { isActive: true, deletedAt: null, canReceiveAssignments: true, canBeCompanion: true, gender: "FEMALE" as const, canParticipateSMM: true };
  assert.equal(isPublisherEligibleForAssignment(woman, "START_CONVERSATION", "ASSIGNEE"), true);
  assert.equal(isPublisherEligibleForAssignment(woman, "START_CONVERSATION", "COMPANION"), true);
});



// ─── Simplificación: "Ser presidente" implica oración inicial/final y conclusión ───

test("oración inicial, oración final y palabras de conclusión requieren canBeChairman", () => {
  assert.equal(requiredCapabilityForType("OPENING_PRAYER"), "canBeChairman");
  assert.equal(requiredCapabilityForType("CLOSING_PRAYER"), "canBeChairman");
  assert.equal(requiredCapabilityForType("CONCLUDING_COMMENTS"), "canBeChairman");
  // El presidente y las palabras de introducción también.
  assert.equal(requiredCapabilityForType("CHAIRMAN"), "canBeChairman");
  assert.equal(requiredCapabilityForType("OPENING_COMMENTS"), "canBeChairman");
});

test("un presidente es elegible para presidente, oraciones y conclusión", () => {
  const chairman = {
    isActive: true,
    deletedAt: null,
    canReceiveAssignments: true,
    canBeCompanion: true,
    gender: "MALE" as const,
    canBeChairman: true,
  };
  for (const type of ["CHAIRMAN", "OPENING_PRAYER", "CLOSING_PRAYER", "CONCLUDING_COMMENTS", "OPENING_COMMENTS"]) {
    assert.equal(isPublisherEligibleForAssignment(chairman, type), true, `presidente debe poder ${type}`);
  }
});

test("un publicador SIN capacidad de presidente NUNCA es elegible para esas partes", () => {
  const nonChairman = {
    isActive: true,
    deletedAt: null,
    canReceiveAssignments: true,
    canBeCompanion: true,
    gender: "MALE" as const,
    canBeChairman: false,
  };
  for (const type of ["CHAIRMAN", "OPENING_PRAYER", "CLOSING_PRAYER", "CONCLUDING_COMMENTS", "OPENING_COMMENTS"]) {
    assert.equal(isPublisherEligibleForAssignment(nonChairman, type), false, `no-presidente no debe poder ${type}`);
  }
});

// ─── Reglas del inicio de reunión (presidente / oraciones / introducción) ────

test("duración: presidente y oraciones no llevan duración; palabras de introducción sí", () => {
  assert.equal(typeHasNoDuration("CHAIRMAN"), true);
  assert.equal(typeHasNoDuration("OPENING_PRAYER"), true);
  assert.equal(typeHasNoDuration("CLOSING_PRAYER"), true);
  assert.equal(typeHasNoDuration("OPENING_COMMENTS"), false, "palabras de introducción sí tiene duración");
  assert.equal(typeHasNoDuration("BIBLE_READING"), false);
  assert.equal(deriveDurationMinutes("OPENING_COMMENTS"), 1);
  assert.equal(deriveDurationMinutes("CHAIRMAN"), 0);
  assert.equal(deriveDurationMinutes("OPENING_PRAYER"), 0);
  assert.equal(deriveDurationMinutes("CLOSING_PRAYER"), 0);
});

test("autocompletado: oración inicial y palabras de introducción siguen al presidente; oración final no", () => {
  assert.equal(isChairmanAutofillType("OPENING_PRAYER"), true);
  assert.equal(isChairmanAutofillType("OPENING_COMMENTS"), true);
  assert.equal(isChairmanAutofillType("CLOSING_PRAYER"), false, "la oración final es independiente");
  assert.equal(isChairmanAutofillType("CHAIRMAN"), false);
});

test("no elegible: inactivo, eliminado o sin permiso de recibir, para partes de inicio", () => {
  const base = {
    canReceiveAssignments: true,
    canBeCompanion: true,
    gender: "MALE" as const,
    canBeChairman: true,
  };
  for (const type of ["CHAIRMAN", "OPENING_PRAYER", "OPENING_COMMENTS", "CLOSING_PRAYER"]) {
    assert.equal(isPublisherEligibleForAssignment({ ...base, isActive: false, deletedAt: null }, type), false, `inactivo no elegible (${type})`);
    assert.equal(isPublisherEligibleForAssignment({ ...base, isActive: true, deletedAt: new Date() }, type), false, `eliminado no elegible (${type})`);
    assert.equal(isPublisherEligibleForAssignment({ ...base, isActive: true, deletedAt: null, canReceiveAssignments: false }, type), false, `sin permiso no elegible (${type})`);
  }
});

test("mujer no elegible para partes de inicio (male-only) aunque tuviera capacidad", () => {
  const woman = {
    isActive: true,
    deletedAt: null,
    canReceiveAssignments: true,
    canBeCompanion: true,
    gender: "FEMALE" as const,
    canBeChairman: true,
  };
  for (const type of ["CHAIRMAN", "OPENING_PRAYER", "OPENING_COMMENTS", "CLOSING_PRAYER"]) {
    assert.equal(isPublisherEligibleForAssignment(woman, type), false, `mujer no elegible (${type})`);
  }
});


// ─── Lector del Estudio Bíblico de la Congregación (EBC) ─────────────────────

test("lector EBC requiere canReadCBS (capacidad distinta de Lectura de la Biblia)", () => {
  assert.equal(requiredCapabilityForType("CONGREGATION_BIBLE_STUDY_READER"), "canReadCBS");
  assert.equal(requiredCapabilityForType("CONGREGATION_BIBLE_STUDY_CONDUCTOR"), "canConductCBS");

  const base = { isActive: true, deletedAt: null, canReceiveAssignments: true, canBeCompanion: true, gender: "MALE" as const };

  // Solo lectura de la Biblia NO habilita lector EBC.
  const soloBibleReading = { ...base, canBibleReading: true, canReadCBS: false };
  assert.equal(isPublisherEligibleForAssignment(soloBibleReading, "CONGREGATION_BIBLE_STUDY_READER"), false);

  // Con canReadCBS sí es elegible.
  const reader = { ...base, canReadCBS: true };
  assert.equal(isPublisherEligibleForAssignment(reader, "CONGREGATION_BIBLE_STUDY_READER"), true);
});

test("lector EBC: mujer, inactivo o sin permiso de recibir NO es elegible", () => {
  const base = { canReceiveAssignments: true, canBeCompanion: true, canReadCBS: true };
  assert.equal(isPublisherEligibleForAssignment({ ...base, isActive: true, deletedAt: null, gender: "FEMALE" }, "CONGREGATION_BIBLE_STUDY_READER"), false, "mujer");
  assert.equal(isPublisherEligibleForAssignment({ ...base, isActive: false, deletedAt: null, gender: "MALE" }, "CONGREGATION_BIBLE_STUDY_READER"), false, "inactivo");
  assert.equal(isPublisherEligibleForAssignment({ ...base, isActive: true, deletedAt: null, gender: "MALE", canReceiveAssignments: false }, "CONGREGATION_BIBLE_STUDY_READER"), false, "sin permiso");
});
