/**
 * Capacidades y estado congregacional del publicador (fuente de verdad del backend).
 *
 * Centraliza, sin nuevas abstracciones sobre la base de datos:
 *  - la lista de capacidades editables y sus etiquetas,
 *  - las reglas ESTRICTAS que el backend debe bloquear (no son sugerencias),
 *  - las SUGERENCIAS automáticas por género / bautismo / nombramiento.
 *
 * El frontend (apps/web) mantiene un espejo de este archivo en
 * `apps/web/src/lib/publisher-capabilities.ts` porque su build de producción no
 * compila este paquete. Mantener AMBOS sincronizados.
 *
 * IMPORTANTE (alcance Fase 1): estas capacidades describen qué puede hacer cada
 * publicador. El generador automático de asignaciones NO se modifica en esta
 * fase y por ahora no consume estos campos.
 */

import type { GenderValue } from "../assignment-rules/index.js";

export type AppointmentValue = "NONE" | "ELDER" | "MINISTERIAL_SERVANT";

/** Claves de capacidades booleanas del publicador. */
export type CapabilityKey =
  | "canReceiveAssignments"
  | "canBeCompanion"
  | "canParticipateSMM"
  | "canBibleReading"
  | "canGiveTalk"
  | "canBeChairman"
  | "canPray"
  | "canTreasures"
  | "canSpiritualGems"
  | "canChristianLife"
  | "canConductCBS"
  | "canReadCBS"
  | "canConcludingRemarks";

export interface CapabilityMeta {
  key: CapabilityKey;
  /** Etiqueta legible en español. */
  label: string;
  /** Grupo para la UI. */
  group: "basic" | "meeting";
  /**
   * Capacidad estricta reservada a hombres: si el género es FEMALE, el backend
   * la rechaza cuando está activada (regla que no se puede romper).
   */
  maleOnly: boolean;
}

/**
 * Catálogo ordenado de capacidades. El orden se respeta en la UI.
 *
 * NOTA sobre reglas estrictas: todas las capacidades marcadas `maleOnly: true`
 * quedan reservadas a hombres y el backend las rechaza para mujeres. Incluye
 * las partes de reunión que en la práctica realizan hombres/nombrados
 * (Perlas Escondidas y Palabras de conclusión también son solo para hombres).
 */
export const CAPABILITIES: CapabilityMeta[] = [
  // Asignaciones básicas
  { key: "canReceiveAssignments", label: "Recibir asignaciones", group: "basic", maleOnly: false },
  { key: "canBeCompanion", label: "Ser acompañante", group: "basic", maleOnly: false },
  { key: "canParticipateSMM", label: "Participar en Seamos Mejores Maestros", group: "basic", maleOnly: false },
  { key: "canBibleReading", label: "Hacer Lectura de la Biblia", group: "basic", maleOnly: true },
  { key: "canGiveTalk", label: "Hacer discurso", group: "basic", maleOnly: true },
  // Partes de la reunión
  { key: "canBeChairman", label: "Ser presidente", group: "meeting", maleOnly: true },
  { key: "canPray", label: "Hacer oración", group: "meeting", maleOnly: true },
  { key: "canTreasures", label: "Hacer Tesoros de la Biblia", group: "meeting", maleOnly: true },
  { key: "canSpiritualGems", label: "Hacer Perlas Escondidas", group: "meeting", maleOnly: true },
  { key: "canChristianLife", label: "Hacer Nuestra Vida Cristiana", group: "meeting", maleOnly: true },
  { key: "canConductCBS", label: "Conducir Estudio Bíblico de la Congregación", group: "meeting", maleOnly: true },
  { key: "canReadCBS", label: "Ser lector del Estudio Bíblico de la Congregación", group: "meeting", maleOnly: true },
  { key: "canConcludingRemarks", label: "Hacer palabras de conclusión", group: "meeting", maleOnly: true },
];

/** Subconjunto de capacidades estrictamente reservadas a hombres. */
export const MALE_ONLY_CAPABILITIES: CapabilityKey[] = CAPABILITIES.filter((c) => c.maleOnly).map((c) => c.key);

/** Forma parcial del publicador para validar/sugerir capacidades. */
export type PublisherCapabilities = Partial<Record<CapabilityKey, boolean>>;

export interface PublisherCapabilityInput extends PublisherCapabilities {
  gender?: GenderValue | null;
  isBaptized?: boolean;
  isRegularPioneer?: boolean;
  appointment?: AppointmentValue;
}

const CAPABILITY_LABEL: Record<CapabilityKey, string> = CAPABILITIES.reduce(
  (acc, c) => {
    acc[c.key] = c.label;
    return acc;
  },
  {} as Record<CapabilityKey, string>,
);

/**
 * Valida las reglas ESTRICTAS que no se pueden romper. Devuelve una lista de
 * mensajes de error en español (vacía si es válido).
 *
 * Reglas:
 *  - Solo los hombres pueden ser nombrados (anciano o siervo ministerial).
 *  - Las mujeres no pueden tener activas las capacidades reservadas a hombres
 *    (lectura, discurso, presidente, oración, Tesoros, Nuestra Vida Cristiana,
 *    conducir el Estudio Bíblico, ser lector del Estudio Bíblico).
 *
 * Conservador con género desconocido: si `gender` es null/undefined no se
 * bloquean las capacidades masculinas (coherente con la elegibilidad existente),
 * pero el nombramiento sí exige MALE explícito por ser una afirmación fuerte.
 */
export function validatePublisherCapabilities(input: PublisherCapabilityInput): string[] {
  const errors: string[] = [];
  const gender = input.gender ?? null;
  const appointment = input.appointment ?? "NONE";

  // Regla estricta: nombramiento solo para hombres.
  if (appointment !== "NONE" && gender !== "MALE") {
    errors.push("Solo los hombres pueden ser nombrados (anciano o siervo ministerial).");
  }

  // Regla estricta: mujeres no pueden tener capacidades reservadas a hombres.
  if (gender === "FEMALE") {
    for (const key of MALE_ONLY_CAPABILITIES) {
      if (input[key] === true) {
        errors.push(`Una mujer no puede: ${CAPABILITY_LABEL[key].toLowerCase()}.`);
      }
    }
  }

  return errors;
}

/** ¿Es válida la combinación? (equivale a no tener errores estrictos). */
export function isValidPublisherCapabilities(input: PublisherCapabilityInput): boolean {
  return validatePublisherCapabilities(input).length === 0;
}

/**
 * Aplica las reglas estrictas de forma automática, forzando a false las
 * capacidades reservadas a hombres cuando el género es FEMALE y el nombramiento
 * a NONE. Útil para sanear datos antes de guardar sin romper el guardado.
 * NO reemplaza a `validatePublisherCapabilities`: el backend debe rechazar
 * combinaciones inválidas; esta función es una ayuda para la UI.
 */
export function enforceStrictCapabilities<T extends PublisherCapabilityInput>(input: T): T {
  const out = { ...input };
  if (out.gender === "FEMALE") {
    for (const key of MALE_ONLY_CAPABILITIES) {
      if (out[key]) out[key] = false;
    }
    out.appointment = "NONE";
  }
  return out;
}

/**
 * Sugerencias automáticas de capacidades según el estado congregacional.
 * Son SOLO sugerencias: el administrador puede ajustarlas salvo reglas estrictas.
 *
 * Casos (según la directiva de Fase 1):
 *  - Mujer: SMM + acompañante + recibir asignaciones. Nada reservado a hombres.
 *  - Hombre no bautizado: SMM + acompañante + lectura. Nada de partes de reunión.
 *  - Hombre bautizado sin nombramiento: lo anterior + discurso.
 *  - Anciano / Siervo ministerial: todas las capacidades.
 */
export function suggestCapabilities(input: {
  gender?: GenderValue | null;
  isBaptized?: boolean;
  appointment?: AppointmentValue;
}): Record<CapabilityKey, boolean> {
  const gender = input.gender ?? null;
  const isBaptized = input.isBaptized ?? false;
  const appointment = input.appointment ?? "NONE";

  // Base: todo en false.
  const caps: Record<CapabilityKey, boolean> = {
    canReceiveAssignments: false,
    canBeCompanion: false,
    canParticipateSMM: false,
    canBibleReading: false,
    canGiveTalk: false,
    canBeChairman: false,
    canPray: false,
    canTreasures: false,
    canSpiritualGems: false,
    canChristianLife: false,
    canConductCBS: false,
    canReadCBS: false,
    canConcludingRemarks: false,
  };

  // Común a todos: puede recibir asignaciones, ser acompañante y participar en SMM.
  caps.canReceiveAssignments = true;
  caps.canBeCompanion = true;
  caps.canParticipateSMM = true;

  // Mujer: no se sugiere ninguna capacidad reservada a hombres.
  if (gender === "FEMALE") {
    return caps;
  }

  // A partir de aquí: hombre (MALE) o género desconocido tratado como hombre
  // para las sugerencias masculinas (el usuario puede ajustar).
  const isMaleLike = gender === "MALE" || gender === null;
  if (!isMaleLike) {
    return caps;
  }

  // Hombre (bautizado o no): puede hacer lectura de la Biblia.
  caps.canBibleReading = true;

  // Hombre bautizado sin nombramiento: además puede hacer discursos.
  if (isBaptized) {
    caps.canGiveTalk = true;
  }

  // Anciano / Siervo ministerial: todas las capacidades.
  if (appointment === "ELDER" || appointment === "MINISTERIAL_SERVANT") {
    caps.canGiveTalk = true;
    caps.canBeChairman = true;
    caps.canPray = true;
    caps.canTreasures = true;
    caps.canSpiritualGems = true;
    caps.canChristianLife = true;
    caps.canConductCBS = true;
    caps.canReadCBS = true;
    caps.canConcludingRemarks = true;
  }

  return caps;
}
