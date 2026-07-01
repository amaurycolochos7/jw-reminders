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
 *  - A person is not used twice in the same week (unless allowSamePersonTwicePerWeek).
 *  - Bible Reading / Talk slots have no companion (needsCompanion=false).
 *  - Gender rules: Bible Reading / Talk are male-only; student parts use a
 *    same-gender companion. Unknown gender is never blocked (conservative).
 *  - Balance: within-month load dominates; prior history breaks ties.
 *  - Frequent pairs are penalized so they are avoided when alternatives exist.
 */

import {
  isAssigneeGenderAllowed,
  isCompanionGenderAllowed,
  isPublisherEligibleForAssignment,
} from "@jw-reminders/shared";

export interface ProposalPublisher {
  id: string;
  fullName: string;
  isActive: boolean;
  deletedAt: Date | string | null;
  canReceiveAssignments: boolean;
  canBeCompanion: boolean;
  gender?: "MALE" | "FEMALE" | null;
}

export interface ProposalSlot {
  assignmentNumber: number;
  section: "BIBLE_READING" | "APPLY_YOURSELF";
  assignmentType: string;
  title: string;
  durationMinutes?: number;
  room: "MAIN" | "AUXILIARY";
  needsCompanion: boolean;
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
  section: "BIBLE_READING" | "APPLY_YOURSELF";
  assignmentType: string;
  title: string;
  durationMinutes?: number;
  room: "MAIN" | "AUXILIARY";
  assignedPublisherId: string;
  companionPublisherId: string | null;
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

    for (const slot of weekSlots) {
      if (existingNumbers.has(slot.assignmentNumber)) continue;

      const assignSalt = salt(week.weekId, slot.assignmentNumber);

      // Pick assigned publisher (respecting gender rules for this part).
      const genderEligible = assignable.filter((p) => isAssigneeGenderAllowed(slot.assignmentType, p.gender));

      // Hard gender rule: if nobody of the required gender exists, leave the slot
      // UNASSIGNED. Never fall back to a gender-ineligible person (e.g. a woman
      // for Bible Reading / Talk).
      if (genderEligible.length === 0) {
        warnings.push(`Semana ${week.weekId}: no hay publicadores del genero requerido para "${slot.title}"; se deja sin asignar.`);
        continue;
      }

      let pool = genderEligible.filter((p) => allowSame || !used.has(p.id));
      if (pool.length === 0) {
        pool = genderEligible;
        warnings.push(`Semana ${week.weekId}: no habia suficientes publicadores distintos; se reutilizo alguien para "${slot.title}".`);
      }

      const assigned = [...pool].sort(byScore((p) => baseScore(p.id), assignSalt))[0];
      liveCount[assigned.id] = (liveCount[assigned.id] || 0) + 1;
      used.add(assigned.id);

      // Pick companion if the slot needs one (same-gender rule applies to student parts).
      let companionId: string | null = null;
      if (slot.needsCompanion) {
        const companionEligible = companions.filter(
          (p) => p.id !== assigned.id && isCompanionGenderAllowed(slot.assignmentType, assigned.gender, p.gender),
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
      });
    }
  }

  return { assignments, warnings };
}
