/**
 * S-140 Data Fetcher
 *
 * Queries the database and maps entities to S140WeekData DTOs
 * ready for the export service.
 */
import { prisma } from "@jw-reminders/database";
import type { S140WeekData, S140ExportInput } from "./s140-export.service.js";

// ─── WOL Bible Reading Extraction ────────────────────────

/**
 * Fetch the weekly bible reading range from WOL program page.
 * Returns something like "JEREMÍAS 13-15" or empty string.
 * The reading is typically the SECOND <h> element on the page
 * (first is the date range, second is the bible reading).
 */
async function fetchBibleReadingFromWol(wolProgramUrl: string | null): Promise<string> {
  if (!wolProgramUrl) return "";
  try {
    const res = await fetch(wolProgramUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "es",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    
    // The Bible reading is the second <h1>/<h2>/<h3> header on the page.
    // First header = date range ("6-12 DE JULIO"), second = reading ("JEREMÍAS 13-15").
    const headerRegex = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
    const headers: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = headerRegex.exec(html)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, "").trim();
      if (text) headers.push(text);
      if (headers.length >= 3) break;
    }
    
    // Second header should be the Bible reading (e.g., "JEREMÍAS 13-15")
    if (headers.length >= 2) {
      const candidate = headers[1];
      // Verify it looks like a Bible reference (book name + numbers)
      if (/[A-ZÁÉÍÓÚÑ]/.test(candidate) && /\d/.test(candidate)) {
        return candidate.toUpperCase();
      }
      // Even without numbers, if it's short and all caps, it's likely the reading
      if (candidate.length < 40 && candidate === candidate.toUpperCase()) {
        return candidate;
      }
    }
    
    return "";
  } catch {
    return "";
  }
}

// ─── Date Formatting ─────────────────────────────────────

const MESES_UPPER = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/**
 * Calculate the date range text, e.g. "16-22 DE MARZO"
 */
function buildDateRange(weekStartDate: Date, weekStartDateLocal: string | null): string {
  let local: string;
  if (weekStartDateLocal) {
    local = weekStartDateLocal;
  } else if (weekStartDate) {
    local = weekStartDate.toISOString().slice(0, 10);
  } else {
    return "";
  }
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
 * Abbreviates to fit S-140 format: "Gabriel de la T" style.
 */
function personName(person: { displayName: string | null; fullName: string; id?: string } | null | undefined): string {
  if (!person) return "—";
  const name = person.displayName || person.fullName;
  return abbreviateName(name);
}

/**
 * Abbreviate a name to fit in the S-140 column (~18 chars max).
 * Strategy: Keep first name + abbreviate last name to initial.
 * Examples:
 *   "Gabriel de la Tórre" → "Gabriel de la T"
 *   "Dorian Gabriel de la Tórre Gomez" → "Gabriel de la T"
 *   "Gady de Gordillo" → "Gady de G"
 *   "Ninive V" → "Ninive V" (already short)
 */
function abbreviateName(name: string): string {
  if (!name || name === "—") return "—";
  // If already short enough, use as-is
  if (name.length <= 18) return name;
  
  // Split into parts
  const parts = name.split(/\s+/).filter(p => p.length > 0);
  if (parts.length <= 1) return name;
  
  // Strategy: keep first word + connecting words + abbreviate last meaningful word
  const connecting = ["de", "la", "del", "los", "las", "el"];
  const abbreviated = [...parts];
  
  // Abbreviate from the end, skipping connecting words
  for (let i = abbreviated.length - 1; i >= 1; i--) {
    if (abbreviated.join(" ").length <= 18) break;
    if (connecting.includes(abbreviated[i].toLowerCase())) continue;
    if (abbreviated[i].length === 0) continue;
    if (abbreviated[i].length <= 1) continue; // already abbreviated
    abbreviated[i] = abbreviated[i][0].toUpperCase();
  }
  
  const result = abbreviated.join(" ");
  if (result.length > 22) return result.slice(0, 19) + "...";
  return result;
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
              assigned: { select: { id: true, displayName: true, fullName: true } },
              companion: { select: { id: true, displayName: true, fullName: true } },
            },
          },
        },
      },
    },
  });

  // Get congregation name: prefer config, fallback to first week's congregationName
  let configRow = await prisma.appConfig.findUnique({ where: { key: "CONGREGATION_NAME" } });
  if (!configRow) {
    configRow = await prisma.appConfig.findUnique({ where: { key: "congregation_name" } });
  }
  let congregationName = configRow?.value || "";
  
  // If config value looks like test data or empty, try week's congregationName
  if (!congregationName || congregationName.toLowerCase().includes("test") || congregationName.toLowerCase().includes("qa")) {
    const firstWeekName = (schedule.weeks as any[])[0]?.congregationName;
    if (firstWeekName) congregationName = firstWeekName;
  }
  if (!congregationName) congregationName = "CONGREGACIÓN";

  const weeks: S140WeekData[] = await Promise.all((schedule.weeks as any[]).map(async (week: any) => {
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
    // Fetch from WOL if available (the data is not stored in DB currently)
    let bibleReadingRange = "";
    const rangeItem = programItems.find((p: any) =>
      p.section === "OPENING" && p.requiresAssignee === false && p.title && !p.title.toLowerCase().includes("canción")
    );
    if (rangeItem) {
      bibleReadingRange = rangeItem.title;
    }
    // If not found from items, will be fetched from WOL later
    if (!bibleReadingRange && week.wolProgramUrl) {
      bibleReadingRange = await fetchBibleReadingFromWol(week.wolProgramUrl);
    }

    // Chairman
    const chairman = findAssignment("CHAIRMAN");
    const openingPrayer = findAssignment("OPENING_PRAYER");
    const closingPrayer = findAssignment("CLOSING_PRAYER");

    // If opening prayer is the same person as chairman, show "—"
    const chairmanId = chairman?.assignedPublisherId;
    const openingPrayerId = openingPrayer?.assignedPublisherId;
    const openingPrayerName = (openingPrayerId && chairmanId && openingPrayerId === chairmanId)
      ? "—"
      : personName(openingPrayer?.assigned);

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
      bibleReading: (bibleReadingRange || "").toUpperCase(),
      chairman: personName(chairman?.assigned),
      openingPrayer: openingPrayerName,
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
  }));

  return { congregationName, weeks };
}
