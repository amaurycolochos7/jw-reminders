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
 *  - Balance: within-month load dominates; prior history breaks ties.
 *  - Frequent pairs are penalized so they are avoided when alternatives exist.
 */

export interface ProposalPublisher {
  id: string;
  fullName: string;
  isActive: boolean;
  deletedAt: Date | string | null;
  canReceiveAssignments: boolean;
  canBeCompanion: boolean;
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
}

export interface ProposalHistory {
  /** Total prior assignments per publisher id (assigned or companion). */
  assignedCount: Record<string, number>;
  /** Prior pairing frequency, keyed by sorted "idA|idB". */
  pairCount: Record<string, number>;
}

export interface ProposalOptions {
  allowSamePersonTwicePerWeek?: boolean;
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

function isAssignable(p: ProposalPublisher): boolean {
  return p.isActive && !p.deletedAt && p.canReceiveAssignments;
}

function isCompanionEligible(p: ProposalPublisher): boolean {
  // A companion also receives an assignment, so canReceiveAssignments must hold too.
  return p.isActive && !p.deletedAt && p.canReceiveAssignments && p.canBeCompanion;
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

  const byScoreThenName = (score: (p: ProposalPublisher) => number) => (a: ProposalPublisher, b: ProposalPublisher) => {
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return a.fullName.localeCompare(b.fullName);
  };

  const assignments: ProposedAssignment[] = [];

  for (const week of input.weeks) {
    const used = new Set<string>(week.existingPublisherIds);
    const existingNumbers = new Set(week.existingNumbers);

    for (const slot of slots) {
      if (existingNumbers.has(slot.assignmentNumber)) continue;

      // Pick assigned publisher.
      let pool = assignable.filter((p) => allowSame || !used.has(p.id));
      if (pool.length === 0) {
        pool = assignable;
        warnings.push(`Semana ${week.weekId}: no habia suficientes publicadores distintos; se reutilizo alguien para "${slot.title}".`);
      }
      const assigned = [...pool].sort(byScoreThenName((p) => baseScore(p.id)))[0];
      liveCount[assigned.id] = (liveCount[assigned.id] || 0) + 1;
      used.add(assigned.id);

      // Pick companion if the slot needs one.
      let companionId: string | null = null;
      if (slot.needsCompanion) {
        let cpool = companions.filter((p) => p.id !== assigned.id && (allowSame || !used.has(p.id)));
        if (cpool.length === 0) {
          cpool = companions.filter((p) => p.id !== assigned.id);
        }
        if (cpool.length === 0) {
          warnings.push(`Semana ${week.weekId}: no hay acompanante disponible para "${slot.title}".`);
        } else {
          const companion = [...cpool].sort(byScoreThenName((p) => baseScore(p.id) + pairScore(assigned.id, p.id)))[0];
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
