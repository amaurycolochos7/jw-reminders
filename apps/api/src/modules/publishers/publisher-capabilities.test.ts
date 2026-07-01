import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePublisherCapabilities,
  isValidPublisherCapabilities,
  suggestCapabilities,
  enforceStrictCapabilities,
  MALE_ONLY_CAPABILITIES,
  isPublisherEligibleForAssignment,
} from "@jw-reminders/shared";

test("mujer no puede tener capacidades reservadas a hombres", () => {
  for (const key of MALE_ONLY_CAPABILITIES) {
    const errors = validatePublisherCapabilities({ gender: "FEMALE", [key]: true });
    assert.ok(errors.length > 0, `debe rechazar ${key} para mujer`);
  }
});

test("mujer con capacidades masculinas en false es válida", () => {
  const errors = validatePublisherCapabilities({
    gender: "FEMALE",
    canParticipateSMM: true,
    canBeCompanion: true,
    canReceiveAssignments: true,
    canSpiritualGems: true, // no es estricta según spec
    canConcludingRemarks: true, // no es estricta según spec
  });
  assert.equal(errors.length, 0);
});

test("mujer no puede ser nombrada (anciano/siervo)", () => {
  assert.ok(validatePublisherCapabilities({ gender: "FEMALE", appointment: "ELDER" }).length > 0);
  assert.ok(validatePublisherCapabilities({ gender: "FEMALE", appointment: "MINISTERIAL_SERVANT" }).length > 0);
});

test("nombramiento requiere género MALE (desconocido se bloquea)", () => {
  assert.ok(validatePublisherCapabilities({ gender: null, appointment: "ELDER" }).length > 0);
  assert.equal(validatePublisherCapabilities({ gender: "MALE", appointment: "ELDER" }).length, 0);
  assert.equal(validatePublisherCapabilities({ gender: "MALE", appointment: "MINISTERIAL_SERVANT" }).length, 0);
});

test("hombre puede tener todas las capacidades", () => {
  const errors = validatePublisherCapabilities({
    gender: "MALE",
    appointment: "ELDER",
    canBibleReading: true,
    canGiveTalk: true,
    canBeChairman: true,
    canPray: true,
    canTreasures: true,
    canChristianLife: true,
    canConductCBS: true,
    canReadCBS: true,
  });
  assert.equal(errors.length, 0);
});

test("género desconocido NO bloquea capacidades masculinas (conservador)", () => {
  const errors = validatePublisherCapabilities({ gender: null, canBibleReading: true, canGiveTalk: true });
  assert.equal(errors.length, 0);
});

test("hombre no bautizado: capacidades limitadas válidas", () => {
  // Un hombre no bautizado puede lectura + SMM + acompañante, sin partes de reunión.
  const errors = validatePublisherCapabilities({
    gender: "MALE",
    isBaptized: false,
    appointment: "NONE",
    canBibleReading: true,
    canParticipateSMM: true,
    canBeCompanion: true,
  });
  assert.equal(errors.length, 0);
});

test("precursor regular puede ser hombre o mujer", () => {
  assert.ok(isValidPublisherCapabilities({ gender: "FEMALE", isRegularPioneer: true }));
  assert.ok(isValidPublisherCapabilities({ gender: "MALE", isRegularPioneer: true }));
});

test("suggestCapabilities: mujer no sugiere capacidades masculinas", () => {
  const caps = suggestCapabilities({ gender: "FEMALE", isBaptized: true });
  assert.equal(caps.canParticipateSMM, true);
  assert.equal(caps.canBeCompanion, true);
  assert.equal(caps.canReceiveAssignments, true);
  for (const key of MALE_ONLY_CAPABILITIES) {
    assert.equal(caps[key], false, `mujer no debe sugerir ${key}`);
  }
  // Las sugerencias para mujer deben ser una combinación válida.
  assert.ok(isValidPublisherCapabilities({ gender: "FEMALE", ...caps }));
});

test("suggestCapabilities: hombre no bautizado tiene lectura pero no discurso ni partes", () => {
  const caps = suggestCapabilities({ gender: "MALE", isBaptized: false, appointment: "NONE" });
  assert.equal(caps.canBibleReading, true);
  assert.equal(caps.canGiveTalk, false);
  assert.equal(caps.canBeChairman, false);
  assert.equal(caps.canPray, false);
});

test("suggestCapabilities: hombre bautizado sin nombramiento añade discurso", () => {
  const caps = suggestCapabilities({ gender: "MALE", isBaptized: true, appointment: "NONE" });
  assert.equal(caps.canBibleReading, true);
  assert.equal(caps.canGiveTalk, true);
  assert.equal(caps.canBeChairman, false);
  assert.equal(caps.canTreasures, false);
});

test("suggestCapabilities: anciano/siervo tiene todas las capacidades", () => {
  for (const appointment of ["ELDER", "MINISTERIAL_SERVANT"] as const) {
    const caps = suggestCapabilities({ gender: "MALE", isBaptized: true, appointment });
    assert.equal(caps.canBeChairman, true);
    assert.equal(caps.canPray, true);
    assert.equal(caps.canTreasures, true);
    assert.equal(caps.canChristianLife, true);
    assert.equal(caps.canConductCBS, true);
    assert.equal(caps.canReadCBS, true);
    assert.equal(caps.canConcludingRemarks, true);
    assert.ok(isValidPublisherCapabilities({ gender: "MALE", appointment, ...caps }));
  }
});

test("enforceStrictCapabilities limpia capacidades masculinas y nombramiento en mujer", () => {
  const cleaned = enforceStrictCapabilities({
    gender: "FEMALE",
    appointment: "ELDER",
    canBibleReading: true,
    canGiveTalk: true,
    canBeChairman: true,
    canParticipateSMM: true,
  });
  assert.equal(cleaned.appointment, "NONE");
  assert.equal(cleaned.canBibleReading, false);
  assert.equal(cleaned.canGiveTalk, false);
  assert.equal(cleaned.canBeChairman, false);
  assert.equal(cleaned.canParticipateSMM, true); // no estricta, se conserva
  assert.ok(isValidPublisherCapabilities(cleaned));
});

// ─── Elegibilidad (no debe romperse) ───

test("publicador inactivo no es elegible para asignaciones", () => {
  assert.equal(
    isPublisherEligibleForAssignment({ isActive: false, canReceiveAssignments: true }, "OTHER", "ASSIGNEE"),
    false,
  );
});

test("publicador borrado (deletedAt) no es elegible", () => {
  assert.equal(
    isPublisherEligibleForAssignment({ isActive: true, deletedAt: new Date(), canReceiveAssignments: true }, "OTHER"),
    false,
  );
});

test("publicador activo que puede recibir asignaciones es elegible", () => {
  assert.equal(
    isPublisherEligibleForAssignment({ isActive: true, deletedAt: null, canReceiveAssignments: true }, "OTHER"),
    true,
  );
});
