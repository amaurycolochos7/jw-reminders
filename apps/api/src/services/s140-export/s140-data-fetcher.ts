/**
 * S-140 Data Fetcher
 *
 * Queries the database and maps entities to S140WeekData DTOs
 * ready for the export service.
 */
import { prisma } from "@jw-reminders/database";
import type { S140WeekData, S140ExportInput } from "./s140-export.service.js";

// ─── Date Formatting ─────────────────────────────────────

const MESES_UPPER = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/**
 * Calculate the date range text, e.g. "16-22 DE MARZO"
 */
function buildDateRange(weekStartDate: Date, weekStartDateLocal: string | null): string {
  const local = weekStartDateLocal || weekStartDate.toISOString().slice(0, 10);
  const [y, m, d] = local.split("-").map(Number);
  const startDay = d;
  const endDay = startDay + 6;
  const month = MESES_UPPER[m - 1];

  // Check if week crosses month boundary
  const daysInMonth = new Date(y, m, 0).getDate();
  if (endDay > daysInMonth) {
    const nextMonth = m < 12 ? MESES_UPPER[m] : MESES_UPPER[0];
    const actualEnd = endDay - daysInMonth;
    return `${startDay} DE ${month}-${actualEnd} DE ${nextMonth}`;
  }

  return `${startDay}-${endDay} DE ${month}`;
}

/**
 * Get person display name, preferring displayName over fullName.
 */
function personName(person: { displayName: string | null; fullName: string } | null | undefined): string {
  if (!person) return "—";
  return person.displayName || person.fullName;
}

/**
 * Format duration string.
 */
function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "";
  return minutes === 1 ? "1 min." : `${minutes} mins.`;
}

/**
 * Extract song number from a title like "Canción 120" or just "120"
 */
function extractSongNumber(title: string | null | undefined): string {
  if (!title) return "—";
  const match = title.match(/\d+/);
  return match ? match[0] : title;
}

// ─── Validation ──────────────────────────────────────────

export interface ExportValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

interface ValidatableWeek {
  weekStartDateLocal?: string | null;
  weekStartDate?: Date | null;
  importStatus?: string;
  assignments?: Array<{ assignmentType: string; section?: string }>;
}

export function validateExportData(weeks: ValidatableWeek[]): ExportValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (weeks.length === 0) {
    errors.push("No hay semanas disponibles para exportar.");
    return { valid: false, warnings, errors };
  }

  for (const week of weeks) {
    const weekLabel = week.weekStartDateLocal || week.weekStartDate?.toISOString().slice(0, 10) || "?";
    
    if (week.importStatus !== "READY") {
      errors.push(`Semana ${weekLabel}: programa no importado (estado: ${week.importStatus}).`);
    }

    const assignments = week.assignments || [];
    const chairman = assignments.find((a) => a.assignmentType === "CHAIRMAN");
    if (!chairman) {
      warnings.push(`Semana ${weekLabel}: no hay presidente asignado.`);
    }

    const closingPrayer = assignments.find((a) => a.assignmentType === "CLOSING_PRAYER");
    if (!closingPrayer) {
      warnings.push(`Semana ${weekLabel}: no hay oración final asignada.`);
    }

    const cbsConductor = assignments.find((a) => a.assignmentType === "CONGREGATION_BIBLE_STUDY_CONDUCTOR");
    const cbsReader = assignments.find((a) => a.assignmentType === "CONGREGATION_BIBLE_STUDY_READER");
    if (!cbsConductor) {
      warnings.push(`Semana ${weekLabel}: no hay conductor del EBC.`);
    }
    if (!cbsReader) {
      warnings.push(`Semana ${weekLabel}: no hay lector del EBC.`);
    }
  }

  return { valid: errors.length === 0, warnings, errors };
}

// ─── Main Data Fetcher ───────────────────────────────────

/**
 * Fetch all data needed to generate S-140 for a monthly schedule.
 */
export async function fetchS140Data(monthlyScheduleId: string): Promise<S140ExportInput> {
  // Get congregation name from config
  const configRow = await prisma.appConfig.findUnique({ where: { key: "congregation_name" } });
  const congregationName = configRow?.value || "CONGREGACIÓN";

  // Fetch weeks with program items and assignments
  const schedule = await prisma.monthlySchedule.findUniqueOrThrow({
    where: { id: monthlyScheduleId },
    include: {
      weeks: {
        where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } },
        orderBy: { weekStartDate: "asc" },
        include: {
          programItems: { orderBy: { sortOrder: "asc" } },
          assignments: {
            where: { status: { notIn: ["CANCELLED", "PROPOSED"] } },
            include: {
              assigned: { select: { displayName: true, fullName: true } },
              companion: { select: { displayName: true, fullName: true } },
            },
          },
        },
      },
    },
  });

  const weeks: S140WeekData[] = (schedule.weeks as any[]).map((week: any) => {
    const assignments: any[] = week.assignments;
    const programItems: any[] = week.programItems;

    // Find assignments by type
    const findAssignment = (type: string) =>
      assignments.find((a: any) => a.assignmentType === type);
    const findAssignmentsBySection = (section: string) =>
      assignments
        .filter((a: any) => a.section === section)
        .sort((a: any, b: any) => a.assignmentNumber - b.assignmentNumber);

    // Find program items by type/section
    const songs = programItems.filter((p: any) => p.assignmentType === "SONG").sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    const treasuresTalkItem = programItems.find((p: any) => p.assignmentType === "TREASURES_TALK");
    const gemsItem = programItems.find((p: any) => p.assignmentType === "SPIRITUAL_GEMS");
    const bibleReadingItem = programItems.find((p: any) =>
      p.assignmentType === "BIBLE_READING" || (p.section === "TREASURES" && p.title?.toLowerCase().includes("lectura"))
    );
    const smmItems = programItems
      .filter((p: any) => p.section === "APPLY_YOURSELF" || (
        ["START_CONVERSATION", "MAKE_RETURN_VISIT", "BIBLE_STUDY", "EXPLAIN_BELIEFS", "MAKE_DISCIPLES", "TALK"].includes(p.assignmentType)
        && p.section !== "TREASURES" && p.section !== "LIVING_AS_CHRISTIANS"
      ))
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    const nvcItems = programItems
      .filter((p: any) =>
        p.section === "LIVING_AS_CHRISTIANS" &&
        p.assignmentType !== "CONGREGATION_BIBLE_STUDY_CONDUCTOR" &&
        p.assignmentType !== "CONGREGATION_BIBLE_STUDY_READER" &&
        p.assignmentType !== "SONG" &&
        p.requiresAssignee !== false
      )
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    const cbsItem = programItems.find((p: any) =>
      p.assignmentType === "CONGREGATION_BIBLE_STUDY_CONDUCTOR" ||
      (p.title?.toLowerCase().includes("estudio") && p.title?.toLowerCase().includes("congregaci"))
    );

    // The weekly bible reading range from the program
    let bibleReadingRange = "";
    const rangeItem = programItems.find((p: any) =>
      p.section === "OPENING" && !p.requiresAssignee && p.title && !p.title.toLowerCase().includes("canción")
    );
    if (rangeItem) {
      bibleReadingRange = rangeItem.title;
    }

    // Chairman
    const chairman = findAssignment("CHAIRMAN");
    const openingPrayer = findAssignment("OPENING_PRAYER");
    const closingPrayer = findAssignment("CLOSING_PRAYER");

    // Treasures section assignments
    const treasuresTalk = findAssignment("TREASURES_TALK");
    const gems = findAssignment("SPIRITUAL_GEMS");
    const bibleReadingAssignment = findAssignment("BIBLE_READING");

    // SMM section assignments (sorted by number)
    const smmAssignments = findAssignmentsBySection("APPLY_YOURSELF");

    // NVC section assignments
    const nvcAssignments = assignments
      .filter((a: any) =>
        a.section === "LIVING_AS_CHRISTIANS" &&
        a.assignmentType !== "CONGREGATION_BIBLE_STUDY_CONDUCTOR" &&
        a.assignmentType !== "CONGREGATION_BIBLE_STUDY_READER"
      )
      .sort((a: any, b: any) => a.assignmentNumber - b.assignmentNumber);

    // CBS
    const cbsConductor = findAssignment("CONGREGATION_BIBLE_STUDY_CONDUCTOR");
    const cbsReader = findAssignment("CONGREGATION_BIBLE_STUDY_READER");

    return {
      dateRange: buildDateRange(week.weekStartDate, week.weekStartDateLocal),
      bibleReading: bibleReadingRange.toUpperCase(),
      chairman: personName(chairman?.assigned),
      openingPrayer: personName(openingPrayer?.assigned),
      openingSong: songs.length >= 1 ? extractSongNumber(songs[0].title) : "—",
      middleSong: songs.length >= 2 ? extractSongNumber(songs[1].title) : "—",
      closingSong: songs.length >= 3 ? extractSongNumber(songs[2].title) : "—",

      treasures: {
        title: treasuresTalkItem?.title || "Tesoros de la Biblia",
        duration: formatDuration(treasuresTalkItem?.durationMinutes ?? 10),
        assignee: personName(treasuresTalk?.assigned),
      },
      spiritualGems: {
        duration: formatDuration(gemsItem?.durationMinutes ?? 10),
        assignee: personName(gems?.assigned),
      },
      bibleReadingPart: {
        duration: formatDuration(bibleReadingItem?.durationMinutes ?? 4),
        assignee: personName(bibleReadingAssignment?.assigned),
      },

      applyYourself: smmItems.map((item: any, idx: number) => {
        const assignment = smmAssignments[idx];
        return {
          title: item.title,
          duration: formatDuration(item.durationMinutes),
          reference: item.reference || "",
          student: personName(assignment?.assigned),
          assistant: personName(assignment?.companion),
        };
      }),

      livingAsChristians: nvcItems.map((item: any, idx: number) => {
        const assignment = nvcAssignments[idx];
        return {
          title: item.title,
          duration: formatDuration(item.durationMinutes),
          assignee: personName(assignment?.assigned),
        };
      }),

      cbs: {
        duration: formatDuration(cbsItem?.durationMinutes ?? 30),
        conductor: personName(cbsConductor?.assigned),
        reader: personName(cbsReader?.assigned),
      },

      closingPrayer: personName(closingPrayer?.assigned),
    };
  });

  return { congregationName, weeks };
}
