import { prisma } from "@jw-reminders/database";
import { createAutomationEvent } from "./automation.service.js";
import { addDaysToLocalDate } from "./date-utils.js";
import { getProvider } from "./providers/registry.js";
import {
  ASSIGNMENT_TYPES,
  AssignmentTypeId,
  NO_COMPANION_TYPES,
  NormalizedProgram,
  NormalizedWeek,
  ParsedProgram,
  RawProgram,
  RoomId,
  SectionId,
  ValidationResult,
} from "./providers/types.js";

const SPANISH_MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}
function asStr(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return undefined;
}

// ─── Parser: RawProgram -> ParsedProgram (lenient) ───────
export function parseProgram(raw: RawProgram): ParsedProgram {
  const d = raw.data as any;
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    throw new Error("El programa debe ser un objeto con year, month y weeks.");
  }
  const weeksRaw = Array.isArray(d.weeks) ? d.weeks : [];
  const weeks = weeksRaw.map((w: any) => ({
    meetingDateLocal: asStr(w?.meetingDateLocal ?? w?.meetingDate ?? w?.date),
    weekStartDateLocal: asStr(w?.weekStartDateLocal ?? w?.weekStart),
    meetingTime: asStr(w?.meetingTime ?? w?.time),
    congregationName: asStr(w?.congregationName ?? w?.congregation),
    parts: Array.isArray(w?.parts)
      ? w.parts.map((p: any) => ({
          assignmentNumber: asNum(p?.assignmentNumber ?? p?.number),
          order: asNum(p?.order),
          section: asStr(p?.section),
          assignmentType: asStr(p?.assignmentType ?? p?.type),
          title: asStr(p?.title ?? p?.name),
          durationMinutes: asNum(p?.durationMinutes ?? p?.duration),
          needsCompanion: typeof p?.needsCompanion === "boolean" ? p.needsCompanion : undefined,
          room: asStr(p?.room),
          reference: asStr(p?.reference ?? p?.ref),
        }))
      : [],
  }));
  return { year: asNum(d.year), month: asNum(d.month), name: asStr(d.name), weeks };
}

// ─── Validator ───────────────────────────────────────────
export function validateProgram(parsed: ParsedProgram): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!parsed.year || parsed.year < 2000 || parsed.year > 2100) errors.push("Ano invalido (2000-2100).");
  if (!parsed.month || parsed.month < 1 || parsed.month > 12) errors.push("Mes invalido (1-12).");
  if (!parsed.weeks || parsed.weeks.length === 0) errors.push("El programa no tiene semanas.");

  (parsed.weeks || []).forEach((w, i) => {
    const label = `Semana ${i + 1}`;
    if (!w.meetingDateLocal || !DATE_RE.test(w.meetingDateLocal)) {
      errors.push(`${label}: fecha de reunion invalida (se espera YYYY-MM-DD).`);
    } else if (parsed.year && parsed.month) {
      const [yy, mm] = w.meetingDateLocal.split("-").map(Number);
      if (yy !== parsed.year || mm !== parsed.month) {
        warnings.push(`${label}: la fecha ${w.meetingDateLocal} no coincide con el mes del programa.`);
      }
    }
    if (w.meetingTime && !TIME_RE.test(w.meetingTime)) errors.push(`${label}: hora invalida (se espera HH:MM).`);
    if (!w.parts || w.parts.length === 0) errors.push(`${label}: no tiene partes.`);
    (w.parts || []).forEach((p, j) => {
      const plabel = `${label} parte ${j + 1}`;
      if (!p.title) errors.push(`${plabel}: falta el titulo.`);
      if (p.section && p.section !== "BIBLE_READING" && p.section !== "APPLY_YOURSELF") {
        errors.push(`${plabel}: seccion invalida '${p.section}'.`);
      }
      if (p.assignmentType && !ASSIGNMENT_TYPES.includes(p.assignmentType as AssignmentTypeId)) {
        errors.push(`${plabel}: tipo invalido '${p.assignmentType}'.`);
      }
      if (p.room && p.room !== "MAIN" && p.room !== "AUXILIARY") errors.push(`${plabel}: sala invalida '${p.room}'.`);
      if (p.durationMinutes !== undefined && (p.durationMinutes < 0 || p.durationMinutes > 120)) {
        warnings.push(`${plabel}: duracion fuera de rango (${p.durationMinutes}).`);
      }
    });
  });

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Normalizer: ParsedProgram -> NormalizedProgram ──────
function mondayOf(meetingDateLocal: string): string {
  const dow = new Date(`${meetingDateLocal}T00:00:00.000Z`).getUTCDay();
  const daysFromMonday = (dow + 6) % 7;
  return addDaysToLocalDate(meetingDateLocal, -daysFromMonday);
}

function inferSection(type: AssignmentTypeId): SectionId {
  return type === "BIBLE_READING" ? "BIBLE_READING" : "APPLY_YOURSELF";
}

export function normalizeProgram(parsed: ParsedProgram): NormalizedProgram {
  const year = parsed.year as number;
  const month = parsed.month as number;
  const name = parsed.name || `${SPANISH_MONTHS[month - 1]} ${year}`;

  const weeks: NormalizedWeek[] = (parsed.weeks || []).map((w) => {
    const meetingDateLocal = w.meetingDateLocal as string;
    const weekStartDateLocal = w.weekStartDateLocal && DATE_RE.test(w.weekStartDateLocal)
      ? w.weekStartDateLocal
      : mondayOf(meetingDateLocal);
    const meetingTime = w.meetingTime || "19:00";

    const sorted = [...(w.parts || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const parts = sorted.map((p, idx) => {
      const assignmentType = (p.assignmentType as AssignmentTypeId) || "OTHER";
      const section = (p.section as SectionId) || inferSection(assignmentType);
      const needsCompanion = p.needsCompanion ?? !NO_COMPANION_TYPES.includes(assignmentType);
      const room = (p.room as RoomId) || "MAIN";
      return {
        order: idx + 1,
        assignmentNumber: idx + 1, // sequential to guarantee uniqueness per week
        section,
        assignmentType,
        title: p.title as string,
        durationMinutes: p.durationMinutes,
        needsCompanion,
        room,
        reference: p.reference,
      };
    });

    return { weekStartDateLocal, meetingDateLocal, meetingTime, congregationName: w.congregationName, parts };
  });

  return { year, month, name, weeks };
}

function utcMidnight(local: string) {
  return new Date(`${local}T00:00:00.000Z`);
}

async function runPipeline(providerId: string, input: unknown) {
  const provider = getProvider(providerId);
  const raw = await provider.fetchRaw(input);
  const parsed = parseProgram(raw);
  const validation = validateProgram(parsed);
  return { raw, parsed, validation };
}

// ─── Preview (no persistence) ────────────────────────────
export async function previewImport(providerId: string, input: unknown) {
  const { parsed, validation } = await runPipeline(providerId, input);
  if (!validation.valid) {
    return { provider: providerId, validation, program: null };
  }
  const normalized = normalizeProgram(parsed);

  // Annotate which weeks already exist for that program.
  const existing = await prisma.monthlySchedule.findUnique({
    where: { year_month: { year: normalized.year, month: normalized.month } },
    include: { weeks: { select: { meetingDateLocal: true } } },
  });
  const existingDates = new Set((existing?.weeks || []).map((w) => w.meetingDateLocal));

  return {
    provider: providerId,
    validation,
    program: {
      year: normalized.year,
      month: normalized.month,
      name: normalized.name,
      programExists: Boolean(existing),
      weeks: normalized.weeks.map((w) => ({
        meetingDateLocal: w.meetingDateLocal,
        weekStartDateLocal: w.weekStartDateLocal,
        meetingTime: w.meetingTime,
        exists: existingDates.has(w.meetingDateLocal),
        partsCount: w.parts.length,
        parts: w.parts.map((p) => ({
          assignmentNumber: p.assignmentNumber,
          section: p.section,
          assignmentType: p.assignmentType,
          title: p.title,
          durationMinutes: p.durationMinutes,
          needsCompanion: p.needsCompanion,
        })),
      })),
    },
  };
}

// ─── Confirm (persist program + weeks + templates) ───────
export async function confirmImport(providerId: string, input: unknown) {
  const { parsed, validation } = await runPipeline(providerId, input);
  if (!validation.valid) {
    const err: any = new Error(`Validacion fallida: ${validation.errors.join("; ")}`);
    err.validation = validation;
    throw err;
  }
  const normalized = normalizeProgram(parsed);

  return prisma.$transaction(
    async (tx) => {
      const schedule = await tx.monthlySchedule.upsert({
        where: { year_month: { year: normalized.year, month: normalized.month } },
        update: { name: normalized.name },
        create: { year: normalized.year, month: normalized.month, name: normalized.name, status: "ACTIVE" },
      });

      let weeksCreated = 0;
      let weeksSkipped = 0;
      let templatesCreated = 0;

      for (const week of normalized.weeks) {
        const existing = await tx.jwMeetingWeek.findFirst({
          where: { monthlyScheduleId: schedule.id, meetingDateLocal: week.meetingDateLocal },
          select: { id: true },
        });
        if (existing) {
          weeksSkipped += 1;
          continue;
        }

        const created = await tx.jwMeetingWeek.create({
          data: {
            monthlyScheduleId: schedule.id,
            weekStartDate: utcMidnight(week.weekStartDateLocal),
            weekStartDateLocal: week.weekStartDateLocal,
            meetingDate: utcMidnight(week.meetingDateLocal),
            meetingDateLocal: week.meetingDateLocal,
            meetingTime: week.meetingTime,
            congregationName: week.congregationName,
            status: "READY",
          },
        });
        weeksCreated += 1;

        for (const part of week.parts) {
          await tx.assignmentTemplate.create({
            data: {
              meetingWeekId: created.id,
              order: part.order,
              assignmentNumber: part.assignmentNumber,
              section: part.section as any,
              assignmentType: part.assignmentType as any,
              title: part.title,
              durationMinutes: part.durationMinutes,
              needsCompanion: part.needsCompanion,
              room: part.room as any,
              reference: part.reference,
              source: providerId,
            },
          });
          templatesCreated += 1;
        }
      }

      await createAutomationEvent(tx, {
        eventType: "PROGRAM_IMPORTED",
        entityType: "MonthlySchedule",
        entityId: schedule.id,
        actorType: "admin",
        metadata: { provider: providerId, weeksCreated, weeksSkipped, templatesCreated },
      });

      return {
        programId: schedule.id,
        name: schedule.name,
        year: schedule.year,
        month: schedule.month,
        weeksCreated,
        weeksSkipped,
        templatesCreated,
        warnings: validation.warnings,
      };
    },
    { timeout: 30000 },
  );
}
