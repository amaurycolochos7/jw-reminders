import { MeetingProgramProvider, RawProgram } from "./types.js";

/**
 * JWProvider - FUTURE / NOT IMPLEMENTED.
 *
 * Documented placeholder for a future provider that would obtain the program
 * from the official Life and Ministry Meeting Workbook EPUB that the
 * administrator downloads themselves (e.g. parsed with a library such as
 * jw-epub-parser), subject to legal review and without redistributing
 * protected editorial content.
 *
 * It is intentionally NOT implemented now because:
 *  - jw.org has no documented public API for the structured program;
 *  - HTML scraping is fragile and disallowed by the terms of use;
 *  - unofficial jw-cdn endpoints are undocumented and unstable.
 *
 * Because every consumer depends only on the MeetingProgramProvider interface,
 * this can be implemented later and registered without changing the import
 * engine, the endpoints, or the UI. See docs/P4-JW-SOURCE-RESEARCH.md.
 */
export const jwProvider: MeetingProgramProvider = {
  id: "jw",
  name: "JW.ORG (futuro)",
  description: "Reservado para una futura integracion basada en el EPUB oficial que el administrador aporte. No disponible todavia (pendiente de revision legal).",
  available: false,
  inputHint: "No disponible. Documentado como mejora futura en docs/P4-JW-SOURCE-RESEARCH.md.",

  async fetchRaw(_input: unknown): Promise<RawProgram> {
    throw new Error("JWProvider no esta implementado todavia. Usa ManualProvider o ImportProvider. Ver docs/P4-JW-SOURCE-RESEARCH.md.");
  },
};
