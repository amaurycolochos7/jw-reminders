import { MeetingProgramProvider, RawProgram, STANDARD_PARTS, EXTENDED_PARTS, PresetPart } from "./types.js";

export interface ManualProviderInput {
  year: number;
  month: number;
  meetingDayOfWeek?: number; // 0=Sun..6=Sat, default Friday(5)
  meetingTime?: string; // HH:MM, default 19:00
  congregationName?: string;
  preset?: "standard" | "extended";
  name?: string;
}

function localDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function meetingDatesForMonth(year: number, month: number, dayOfWeek: number): string[] {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCDay() === dayOfWeek) dates.push(localDate(year, month, day));
  }
  return dates;
}

/**
 * ManualProvider scaffolds the standard structure of a month (meeting weeks +
 * typical parts) so the admin can confirm and edit it. It does not read any
 * external source and never stores protected editorial content.
 */
export const manualProvider: MeetingProgramProvider = {
  id: "manual",
  name: "Manual (estructura estandar)",
  description: "Genera la estructura tipica del mes (semanas + partes estandar) para revisar y confirmar. No consulta fuentes externas.",
  available: true,
  inputHint: "Requiere ano, mes, dia y hora de reunion. Opcional: preset 'standard' (4 partes) o 'extended' (6 partes).",

  async fetchRaw(input: unknown): Promise<RawProgram> {
    const opts = (input || {}) as ManualProviderInput;
    if (!opts.year || !opts.month) throw new Error("ManualProvider requiere 'year' y 'month'.");
    const dayOfWeek = opts.meetingDayOfWeek ?? 5;
    const meetingTime = opts.meetingTime ?? "19:00";
    const parts: PresetPart[] = opts.preset === "extended" ? EXTENDED_PARTS : STANDARD_PARTS;

    const dates = meetingDatesForMonth(opts.year, opts.month, dayOfWeek);
    const weeks = dates.map((meetingDateLocal) => ({
      meetingDateLocal,
      meetingTime,
      congregationName: opts.congregationName,
      parts: parts.map((p) => ({ ...p })),
    }));

    return {
      source: "manual",
      data: { year: opts.year, month: opts.month, name: opts.name, weeks },
    };
  },
};
