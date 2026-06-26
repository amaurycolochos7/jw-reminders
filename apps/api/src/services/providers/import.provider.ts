import { MeetingProgramProvider, RawProgram } from "./types.js";

export interface ImportProviderInput {
  /** A JSON object, or a JSON string, prepared by the admin. */
  payload: unknown;
}

/**
 * ImportProvider ingests a structured payload that the administrator prepares
 * on their own (for example, exported from their own EPUB via a separate tool,
 * or written by hand). It only carries operational data (part titles, section,
 * type, duration) - never redistributes protected editorial content.
 *
 * Expected payload shape (lenient; the parser/validator enforce correctness):
 * {
 *   "year": 2026, "month": 7, "name": "Julio 2026",
 *   "weeks": [
 *     { "meetingDate": "2026-07-03", "meetingTime": "19:00",
 *       "parts": [ { "assignmentNumber": 1, "section": "BIBLE_READING",
 *                    "type": "BIBLE_READING", "title": "Lectura de la Biblia",
 *                    "durationMinutes": 4, "needsCompanion": false } ] }
 *   ]
 * }
 */
export const importProvider: MeetingProgramProvider = {
  id: "import",
  name: "Importar (JSON estructurado)",
  description: "Importa un programa desde un JSON estructurado que el administrador aporta. No descarga ni redistribuye contenido protegido.",
  available: true,
  inputHint: "Requiere 'payload': un objeto JSON (o texto JSON) con year, month y weeks[] (cada semana con meetingDate y parts[]).",

  async fetchRaw(input: unknown): Promise<RawProgram> {
    const opts = (input || {}) as ImportProviderInput;
    if (opts.payload === undefined || opts.payload === null || opts.payload === "") {
      throw new Error("ImportProvider requiere 'payload' con el programa en JSON.");
    }

    let data: unknown = opts.payload;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        throw new Error("El 'payload' no es un JSON valido.");
      }
    }

    return { source: "import", data };
  },
};
