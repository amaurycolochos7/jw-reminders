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
  validateAssignmentGenders,
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
