/**
 * Pure, deterministic assignment-proposal generator.
 *
 * Distributes publishers across a month's meeting weeks in a balanced way,
 * considering prior history and avoiding frequent pairs, while respecting
 * eligibility rules. It produces a PROPOSAL only - no DB writes, no messages.
 *
 * Rules enforced here:
 *  - Only active, non-deleted publishers that canReceiveAssignments may be assigned.
 *  - Only active, non-deleted publishers that canBeCompanion may be companions.
 *  - Capability rules (Fase 2): each part requires the matching capability
 *    (Bible Reading→canBibleReading, Talk→canGiveTalk, student parts→
 *    canParticipateSMM). A publisher whose capability is explicitly false is
 *    never selected for that part (assignee or companion). Missing capability
 *    (undefined) keeps the legacy gender-only behavior.
 *  - A person is not used twice in the same week (unless allowSamePersonTwicePerWeek).
 *  - Bible Reading / Talk slots have no companion (needsCompanion=false).
 *  - Gender rules: Bible Reading / Talk are male-only; student parts use a
 *    same-gender companion. Unknown gender is never blocked (conservative).
 *  - Balance: within-month load dominates; prior history breaks ties.
 *  - Frequent pairs are penalized so they are avoided when alternatives exist.
 */

import {
  isChairmanAutofillType,
  isCompanionGenderAllowed,
  isPublisherEligibleForAssignment,
  type SectionId,
} from "@jw-reminders/shared";

export interface ProposalPublisher {
  id: string;
  fullName: string;
  isActive: boolean;
  deletedAt: Date | string | null;
  canReceiveAssignments: boolean;
  canBeCompanion: boolean;
  gender?: "MALE" | "FEMALE" | null;
  // Nombramiento congregacional. Usado por la regla mensual "un siervo
  // ministerial preside una vez al mes". Opcional para retrocompatibilidad.
  appointment?: "NONE" | "ELDER" | "MINISTERIAL_SERVANT" | null;
  // Capacidades reales (Fase 2). Opcionales para retrocompatibilidad con
  // llamadas/tests que no las proveen (en ese caso se usa solo la regla de género).
  canBibleReading?: boolean;
  canGiveTalk?: boolean;
  canParticipateSMM?: boolean;
  // Capacidades de partes de reunión (Fase 3). Necesarias para que la
  // elegibilidad bloquee correctamente presidente/oración/Tesoros/etc.
  canBeChairman?: boolean;
  canPray?: boolean;
  canTreasures?: boolean;
  canSpiritualGems?: boolean;
  canChristianLife?: boolean;
  canConductCBS?: boolean;
  canReadCBS?: boolean;
  canConcludingRemarks?: boolean;
}

export interface ProposalSlot {
  assignmentNumber: number;
  section: SectionId;
  assignmentType: string;
  title: string;
  durationMinutes?: number;
  room: "MAIN" | "AUXILIARY";
  needsCompanion: boolean;
  /** Item real de WOL del que proviene este slot (si aplica). */
  programItemId?: string;
}

export interface ProposalWeekInput {
  weekId: string;
  /** Assignment numbers already present in the week (those slots are skipped). */
  existingNumbers: number[];
  /** Publisher ids already used in the week (avoided to prevent duplicates). */
  existingPublisherIds: string[];
  /** Per-week slots (e.g. from imported AssignmentTemplates). Falls back to global slots. */
  slots?: ProposalSlot[];
}

export interface ProposalHistory {
  /** Total prior assignments per publisher id (assigned or companion). */
  assignedCount: Record<string, number>;
  /** Prior pairing frequency, keyed by sorted "idA|idB". */
  pairCount: Record<string, number>;
}

export interface ProposalOptions {
  allowSamePersonTwicePerWeek?: boolean;
  /**
   * When set, ties between equally-scored publishers are broken using this seed
   * instead of alphabetical order. Used by "regenerate" to produce a different
   * (still balanced) distribution on each run.
   */
  seed?: number;
}

export interface ProposedAssignment {
  weekId: string;
  assignmentNumber: number;
  section: SectionId;
  assignmentType: string;
  title: string;
  durationMinutes?: number;
  room: "MAIN" | "AUXILIARY";
  assignedPublisherId: string;
  companionPublisherId: string | null;
  /** Item real de WOL enlazado (si el slot provino de MeetingProgramItem). */
  programItemId?: string | null;
}

export interface ProposalResult {
  assignments: ProposedAssignment[];
  warnings: string[];
}

// Within-month balancing dominates; historical count is the tiebreaker.
const LIVE_WEIGHT = 1000;
const PAIR_WEIGHT = 1000;

/** Standard midweek-meeting slots. Bible Reading is individual; the rest allow a companion. */
export const DEFAULT_SLOTS: ProposalSlot[] = [
  { assignmentNumber: 1, section: "BIBLE_READING", assignmentType: "BIBLE_READING", title: "Lectura de la Biblia", durationMinutes: 4, room: "MAIN", needsCompanion: false },
  { assignmentNumber: 2, section: "APPLY_YOURSELF", assignmentType: "START_CONVERSATION", title: "Empiece conversaciones", durationMinutes: 3, room: "MAIN", needsCompanion: true },
  { assignmentNumber: 3, section: "APPLY_YOURSELF", assignmentType: "MAKE_RETURN_VISIT", title: "Haga revisitas", durationMinutes: 4, room: "MAIN", needsCompanion: true },
  { assignmentNumber: 4, section: "APPLY_YOURSELF", assignmentType: "BIBLE_STUDY", title: "Curso biblico", durationMinutes: 5, room: "MAIN", needsCompanion: true },
];

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Deterministic 32-bit hash of a string (FNV-1a). */
function hashStringToInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Stable pseudo-random value in [0,1) for a publisher id under a given seed.
 * Kept for potential external use; tie-breaking now uses a slot-salted hash.
 */
function isAssignable(p: ProposalPublisher): boolean {
  // Base eligibility (active, not deleted, can receive). Gender is checked per-slot.
  return isPublisherEligibleForAssignment(p, "OTHER", "ASSIGNEE");
}

function isCompanionEligible(p: ProposalPublisher): boolean {
  // A companion also receives an assignment, so canReceiveAssignments must hold too.
  return isPublisherEligibleForAssignment(p, "OTHER", "COMPANION");
}

export function buildAssignmentProposal(input: {
  weeks: ProposalWeekInput[];
  publishers: ProposalPublisher[];
  history: ProposalHistory;
  slots?: ProposalSlot[];
  options?: ProposalOptions;
}): ProposalResult {
  const slots = input.slots ?? DEFAULT_SLOTS;
  const allowSame = input.options?.allowSamePersonTwicePerWeek ?? false;
  const seed = input.options?.seed;

  const assignable = input.publishers.filter(isAssignable);
  const companions = input.publishers.filter(isCompanionEligible);

  const warnings: string[] = [];
  if (assignable.length === 0) {
    return { assignments: [], warnings: ["No hay publicadores activos que puedan recibir asignaciones."] };
  }

  const liveCount: Record<string, number> = {};
  const livePair: Record<string, number> = {};

  const baseScore = (id: string) => (input.history.assignedCount[id] || 0) + (liveCount[id] || 0) * LIVE_WEIGHT;
  const pairScore = (a: string, b: string) => {
    const key = pairKey(a, b);
    return (input.history.pairCount[key] || 0) + (livePair[key] || 0) * PAIR_WEIGHT;
  };

  // Unbiased, stable tie-break. Instead of alphabetical order (which always
  // favored the first name, e.g. "Amaury"), ties are broken by a hash of
  // weekId + assignmentNumber + seed + publisherId. This is deterministic for a
  // given generation, differs per slot (so the same low-score set does not keep
  // picking the same person), and reshuffles when "regenerate" passes a new seed.
  const salt = (weekId: string, assignmentNumber: number, extra = "") =>
    `${weekId}|${assignmentNumber}|${seed ?? 0}|${extra}`;

  const byScore =
    (score: (p: ProposalPublisher) => number, saltKey: string) =>
    (a: ProposalPublisher, b: ProposalPublisher) => {
      const diff = score(a) - score(b);
      if (diff !== 0) return diff;
      return hashStringToInt(`${saltKey}|${a.id}`) - hashStringToInt(`${saltKey}|${b.id}`);
    };

  const assignments: ProposedAssignment[] = [];

  for (const week of input.weeks) {
    const used = new Set<string>(week.existingPublisherIds);
    const existingNumbers = new Set(week.existingNumbers);
    const weekSlots = week.slots ?? slots;
    // ponytail: track chairman per week so CBS reader can't be the same person
    let weekChairmanId: string | null = null;

    for (const slot of weekSlots) {
      if (existingNumbers.has(slot.assignmentNumber)) continue;

      const assignSalt = salt(week.weekId, slot.assignmentNumber);

      // Pick assigned publisher (respecting capability + gender rules for this part).
      let slotEligible = assignable.filter((p) =>
        isPublisherEligibleForAssignment(p, slot.assignmentType, "ASSIGNEE"),
      );

      // Hard rule: chairman cannot also be CBS reader in the same week.
      if (slot.assignmentType === "CONGREGATION_BIBLE_STUDY_READER" && weekChairmanId) {
        slotEligible = slotEligible.filter((p) => p.id !== weekChairmanId);
      }

      // Hard rule: if nobody eligible (by capability/gender) exists, leave the
      // slot UNASSIGNED. Never fall back to an ineligible person (e.g. someone
      // without canBibleReading, or a woman for Bible Reading / Talk).
      if (slotEligible.length === 0) {
        warnings.push(`Semana ${week.weekId}: no hay publicadores con la capacidad/genero requerido para "${slot.title}"; se deja sin asignar.`);
        continue;
      }

      let pool = slotEligible.filter((p) => allowSame || !used.has(p.id));
      if (pool.length === 0) {
        pool = slotEligible;
        warnings.push(`Semana ${week.weekId}: no habia suficientes publicadores distintos; se reutilizo alguien para "${slot.title}".`);
      }

      const assigned = [...pool].sort(byScore((p) => baseScore(p.id), assignSalt))[0];
      liveCount[assigned.id] = (liveCount[assigned.id] || 0) + 1;
      used.add(assigned.id);

      // Track chairman for CBS reader exclusion rule
      if (slot.assignmentType === "CHAIRMAN") {
        weekChairmanId = assigned.id;
      }

      // Pick companion if the slot needs one (same-gender rule applies to student parts).
      let companionId: string | null = null;
      if (slot.needsCompanion) {
        const companionEligible = companions.filter(
          (p) =>
            p.id !== assigned.id &&
            isPublisherEligibleForAssignment(p, slot.assignmentType, "COMPANION") &&
            isCompanionGenderAllowed(slot.assignmentType, assigned.gender, p.gender),
        );
        let cpool = companionEligible.filter((p) => allowSame || !used.has(p.id));
        if (cpool.length === 0) {
          cpool = companionEligible;
        }
        if (cpool.length === 0) {
          warnings.push(`Semana ${week.weekId}: no hay acompanante disponible para "${slot.title}".`);
        } else {
          const companion = [...cpool].sort(
            byScore((p) => baseScore(p.id) + pairScore(assigned.id, p.id), salt(week.weekId, slot.assignmentNumber, "c")),
          )[0];
          companionId = companion.id;
          liveCount[companion.id] = (liveCount[companion.id] || 0) + 1;
          livePair[pairKey(assigned.id, companion.id)] = (livePair[pairKey(assigned.id, companion.id)] || 0) + 1;
          used.add(companion.id);
        }
      }

      assignments.push({
        weekId: week.weekId,
        assignmentNumber: slot.assignmentNumber,
        section: slot.section,
        assignmentType: slot.assignmentType,
        title: slot.title,
        durationMinutes: slot.durationMinutes,
        room: slot.room,
        assignedPublisherId: assigned.id,
        companionPublisherId: companionId,
        programItemId: slot.programItemId ?? null,
      });
    }
  }

  // ─── Regla mensual: un siervo ministerial preside al menos una vez al mes ───
  // Se aplica como post-pase sobre las asignaciones de CHAIRMAN ya generadas del
  // conjunto de semanas (el mes). Si ninguna semana tiene a un siervo ministerial
  // presidiendo, se reasigna la presidencia de UNA semana a un siervo ministerial
  // elegible, eligiendo de forma equilibrada (menor carga) y evitando duplicar
  // persona en esa semana. Si no hay ninguno elegible, se registra una advertencia.
  enforceMinisterialServantChairman(assignments, input.publishers, baseScore, warnings, seed);

  // ─── Autocompletado de las partes del presidente ────────────────────────────
  // Por defecto las realiza el mismo presidente. Tras fijar la presidencia de
  // cada semana (incluida la regla del siervo ministerial), las partes en
  // CHAIRMAN_AUTOFILL_TYPES (oración inicial, palabras de introducción, palabras
  // de conclusión y oración final) toman el mismo publicador que preside.
  autofillOpeningPartsFromChairman(assignments);

  return { assignments, warnings };
}

/**
 * Hace que, por cada semana, las partes que realiza el presidente
 * (CHAIRMAN_AUTOFILL_TYPES: oración inicial, palabras de introducción, palabras
 * de conclusión y oración final) queden asignadas al mismo publicador que preside
 * (CHAIRMAN). Muta `assignments` en su lugar. No crea partes que no existan; solo
 * alinea las que el programa de la semana ya incluye.
 */
export function autofillOpeningPartsFromChairman(assignments: ProposedAssignment[]): void {
  const chairmanByWeek = new Map<string, string>();
  for (const a of assignments) {
    if (a.assignmentType === "CHAIRMAN") chairmanByWeek.set(a.weekId, a.assignedPublisherId);
  }
  for (const a of assignments) {
    if (isChairmanAutofillType(a.assignmentType)) {
      const chairId = chairmanByWeek.get(a.weekId);
      if (chairId) {
        a.assignedPublisherId = chairId;
        a.companionPublisherId = null;
      }
    }
  }
}

/**
 * Garantiza que, en el conjunto de semanas dado (un mes), al menos una CHAIRMAN
 * la ocupe un siervo ministerial. Muta `assignments` en su lugar.
 */
function enforceMinisterialServantChairman(
  assignments: ProposedAssignment[],
  publishers: ProposalPublisher[],
  baseScore: (id: string) => number,
  warnings: string[],
  seed?: number,
): void {
  const chairmanAssignments = assignments.filter((a) => a.assignmentType === "CHAIRMAN");
  if (chairmanAssignments.length === 0) return; // No hay presidencia que ajustar.

  const pubById = new Map(publishers.map((p) => [p.id, p]));
  const isMS = (id: string | null | undefined) =>
    !!id && pubById.get(id)?.appointment === "MINISTERIAL_SERVANT";

  // Ya se cumple: alguna semana tiene siervo ministerial presidiendo.
  if (chairmanAssignments.some((a) => isMS(a.assignedPublisherId))) return;

  // Candidatos: siervos ministeriales elegibles para presidir.
  const msCandidates = publishers.filter(
    (p) => p.appointment === "MINISTERIAL_SERVANT" && isPublisherEligibleForAssignment(p, "CHAIRMAN", "ASSIGNEE"),
  );
  if (msCandidates.length === 0) {
    warnings.push(
      "Ningún siervo ministerial elegible para presidir este mes; la presidencia queda en anciano(s). Revise nombramientos y la capacidad de presidente.",
    );
    return;
  }

  // Personas usadas por semana (para no duplicar a alguien en su propia semana).
  const usedByWeek = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!usedByWeek.has(a.weekId)) usedByWeek.set(a.weekId, new Set());
    usedByWeek.get(a.weekId)!.add(a.assignedPublisherId);
    if (a.companionPublisherId) usedByWeek.get(a.weekId)!.add(a.companionPublisherId);
  }

  // Elegir el siervo ministerial con menor carga (equilibrio/rotación entre meses),
  // con desempate estable por hash + semilla.
  const rankedMS = [...msCandidates].sort((a, b) => {
    const diff = baseScore(a.id) - baseScore(b.id);
    if (diff !== 0) return diff;
    return hashStringToInt(`ms|${seed ?? 0}|${a.id}`) - hashStringToInt(`ms|${seed ?? 0}|${b.id}`);
  });

  // Elegir una semana de presidencia para reasignar: preferir una donde el siervo
  // ministerial elegido NO esté ya ocupado esa semana.
  for (const ms of rankedMS) {
    const target =
      chairmanAssignments.find((a) => !(usedByWeek.get(a.weekId)?.has(ms.id))) ??
      chairmanAssignments[0];
    if (target) {
      target.assignedPublisherId = ms.id;
      target.companionPublisherId = null;
      return;
    }
  }
}
