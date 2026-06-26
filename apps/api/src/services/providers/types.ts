/**
 * Decoupled provider layer for importing meeting programs.
 *
 * The rest of the system consumes ONLY the MeetingProgramProvider interface and
 * the canonical Normalized* shapes, so a provider can be swapped (Manual, Import,
 * or a future JWProvider) without touching the import engine or the UI.
 */

export type SectionId = "BIBLE_READING" | "APPLY_YOURSELF";
export type RoomId = "MAIN" | "AUXILIARY";

export const ASSIGNMENT_TYPES = [
  "BIBLE_READING",
  "START_CONVERSATION",
  "MAKE_RETURN_VISIT",
  "BIBLE_STUDY",
  "EXPLAIN_BELIEFS",
  "MAKE_DISCIPLES",
  "TALK",
  "OTHER",
] as const;
export type AssignmentTypeId = (typeof ASSIGNMENT_TYPES)[number];

/** Types that are normally delivered without a companion. */
export const NO_COMPANION_TYPES: AssignmentTypeId[] = ["BIBLE_READING", "TALK"];

// ─── Raw (provider output, before parsing) ───────────────
export interface RawProgram {
  /** id of the provider that produced this. */
  source: string;
  /** provider-specific, loosely-typed payload. */
  data: unknown;
}

// ─── Parsed (lenient intermediate) ───────────────────────
export interface ParsedPart {
  assignmentNumber?: number;
  order?: number;
  section?: string;
  assignmentType?: string;
  title?: string;
  durationMinutes?: number;
  needsCompanion?: boolean;
  room?: string;
  reference?: string;
}
export interface ParsedWeek {
  meetingDateLocal?: string;
  weekStartDateLocal?: string;
  meetingTime?: string;
  congregationName?: string;
  parts?: ParsedPart[];
}
export interface ParsedProgram {
  year?: number;
  month?: number;
  name?: string;
  weeks?: ParsedWeek[];
}

// ─── Normalized (canonical, ready to persist) ────────────
export interface NormalizedPart {
  order: number;
  assignmentNumber: number;
  section: SectionId;
  assignmentType: AssignmentTypeId;
  title: string;
  durationMinutes?: number;
  needsCompanion: boolean;
  room: RoomId;
  reference?: string;
}
export interface NormalizedWeek {
  weekStartDateLocal: string;
  meetingDateLocal: string;
  meetingTime: string;
  congregationName?: string;
  parts: NormalizedPart[];
}
export interface NormalizedProgram {
  year: number;
  month: number;
  name: string;
  weeks: NormalizedWeek[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Provider interface (the only thing the system consumes) ──
export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;
  /** Human-readable description of the input the provider expects. */
  inputHint: string;
}

export interface MeetingProgramProvider extends ProviderInfo {
  /** Produce a raw program from the provider's source. Pure of DB side effects. */
  fetchRaw(input: unknown): Promise<RawProgram>;
}

// ─── Standard part presets (operational titles only, no protected content) ──
export interface PresetPart {
  assignmentNumber: number;
  section: SectionId;
  assignmentType: AssignmentTypeId;
  title: string;
  durationMinutes?: number;
  needsCompanion: boolean;
  room: RoomId;
}

export const STANDARD_PARTS: PresetPart[] = [
  { assignmentNumber: 1, section: "BIBLE_READING", assignmentType: "BIBLE_READING", title: "Lectura de la Biblia", durationMinutes: 4, needsCompanion: false, room: "MAIN" },
  { assignmentNumber: 2, section: "APPLY_YOURSELF", assignmentType: "START_CONVERSATION", title: "Empiece conversaciones", durationMinutes: 3, needsCompanion: true, room: "MAIN" },
  { assignmentNumber: 3, section: "APPLY_YOURSELF", assignmentType: "MAKE_RETURN_VISIT", title: "Haga revisitas", durationMinutes: 4, needsCompanion: true, room: "MAIN" },
  { assignmentNumber: 4, section: "APPLY_YOURSELF", assignmentType: "BIBLE_STUDY", title: "Curso biblico", durationMinutes: 5, needsCompanion: true, room: "MAIN" },
];

export const EXTENDED_PARTS: PresetPart[] = [
  ...STANDARD_PARTS,
  { assignmentNumber: 5, section: "APPLY_YOURSELF", assignmentType: "EXPLAIN_BELIEFS", title: "Explique sus creencias", durationMinutes: 5, needsCompanion: true, room: "MAIN" },
  { assignmentNumber: 6, section: "APPLY_YOURSELF", assignmentType: "TALK", title: "Discurso", durationMinutes: 5, needsCompanion: false, room: "MAIN" },
];
