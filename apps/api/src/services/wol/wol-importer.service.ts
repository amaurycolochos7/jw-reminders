import { prisma } from "@jw-reminders/database";
import { getWolWeekCoordinates } from "@jw-reminders/shared";
import { parseWolProgram, ParsedProgramItem } from "./wol-parser.js";

/**
 * WolMeetingImporterService
 *
 * Importa el programa REAL de Vida y Ministerio desde wol.jw.org para una
 * semana. Nunca inventa datos: si WOL falla o cambia de estructura, la
 * importación queda en IMPORT_FAILED / NEEDS_REVIEW y se permite captura manual.
 *
 * El acceso a red está aislado en un `WolFetcher` inyectable para poder probar
 * el flujo sin conexión y para no depender de selectores frágiles.
 */

export type WolFetcher = (url: string) => Promise<string>;

/** Fetcher por defecto: usa fetch global (Node >= 18) con cabeceras de navegador. */
export const defaultWolFetcher: WolFetcher = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "es",
    },
  });
  if (!res.ok) throw new Error(`WOL respondió HTTP ${res.status} para ${url}`);
  return res.text();
};

// ─── Utilidades de HTML → texto ──────────────────────────

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&aacute;": "á", "&eacute;": "é", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú",
  "&Aacute;": "Á", "&Eacute;": "É", "&Iacute;": "Í", "&Oacute;": "Ó", "&Uacute;": "Ú",
  "&ntilde;": "ñ", "&Ntilde;": "Ñ", "&uuml;": "ü", "&amp;": "&", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&laquo;": "«", "&raquo;": "»", "&mdash;": "—", "&ndash;": "–",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-zA-Z#0-9]+;/g, (m) => ENTITIES[m] ?? m);
}

/** Convierte HTML en texto visible, preservando saltos entre bloques. */
export function htmlToText(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  out = decodeEntities(out);
  return out.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
}

// ─── Localizar el enlace de Vida y Ministerio ────────────

interface Anchor {
  href: string;
  text: string;
}

function extractAnchors(html: string): Anchor[] {
  const anchors: Anchor[] = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    anchors.push({ href: m[1], text: htmlToText(m[2]) });
  }
  return anchors;
}

function toAbsoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/**
 * Encuentra la URL real del programa de Vida y Ministerio dentro de la página
 * de reuniones. Estrategia robusta (no depende de un único selector):
 *  1. Enlaces /wol/d/ cuyo texto o contexto mencione "vida y ministerio".
 *  2. Si no hay, el primer enlace /wol/d/ de la página (las reuniones enlazan
 *     su propio programa).
 */
export function findVidaYMinisterioLink(html: string, baseUrl: string): string | null {
  const anchors = extractAnchors(html).filter((a) => /\/wol\/d\//i.test(a.href));
  if (anchors.length === 0) return null;

  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const byText = anchors.find((a) => {
    const t = normalize(a.text);
    return t.includes("vida y ministerio") || t.includes("nuestra vida y ministerio");
  });
  if (byText) return toAbsoluteUrl(byText.href, baseUrl);

  // Heurística por contexto: buscar "vida y ministerio" en el HTML y tomar el
  // enlace /wol/d/ más cercano después de esa mención.
  const idx = normalize(html).indexOf("vida y ministerio");
  if (idx >= 0) {
    const after = html.slice(idx);
    const m = after.match(/href=["']([^"']*\/wol\/d\/[^"']+)["']/i);
    if (m) return toAbsoluteUrl(m[1], baseUrl);
  }

  return toAbsoluteUrl(anchors[0].href, baseUrl);
}

// ─── Validación de completitud ───────────────────────────

/** Un item está completo si tiene título, duración y (si aplica) descripción. */
function itemLooksComplete(item: ParsedProgramItem): boolean {
  if (!item.title) return false;
  if (item.durationMinutes == null) return false;
  return true;
}

// ─── Persistencia ────────────────────────────────────────

export interface ImportResult {
  weekId: string;
  status: "READY" | "NEEDS_REVIEW" | "IMPORT_FAILED";
  itemCount: number;
  wolMeetingsUrl: string | null;
  wolProgramUrl: string | null;
  warnings: string[];
  error?: string;
}

async function persistItems(weekId: string, items: ParsedProgramItem[], sourceUrl: string) {
  // Upsert estable por (weekId, sortOrder). No duplica ni borra lo ya enviado.
  for (const item of items) {
    await prisma.meetingProgramItem.upsert({
      where: { meetingWeekId_sortOrder: { meetingWeekId: weekId, sortOrder: item.sortOrder } },
      create: {
        meetingWeekId: weekId,
        itemNumber: item.itemNumber ?? undefined,
        section: item.section ?? undefined,
        title: item.title,
        assignmentType: item.assignmentType as any,
        durationMinutes: item.durationMinutes ?? undefined,
        context: item.context ?? undefined,
        description: item.description ?? undefined,
        reference: item.reference ?? undefined,
        lesson: item.lesson ?? undefined,
        requiresAssistant: item.requiresAssistant,
        sourceUrl,
        sortOrder: item.sortOrder,
        rawText: item.rawText ?? undefined,
      },
      update: {
        itemNumber: item.itemNumber ?? null,
        section: item.section ?? null,
        title: item.title,
        assignmentType: item.assignmentType as any,
        durationMinutes: item.durationMinutes ?? null,
        context: item.context ?? null,
        description: item.description ?? null,
        reference: item.reference ?? null,
        lesson: item.lesson ?? null,
        requiresAssistant: item.requiresAssistant,
        sourceUrl,
        sortOrder: item.sortOrder,
        rawText: item.rawText ?? null,
      },
    });
  }
}

/**
 * Importa desde un texto ya obtenido (captura manual o pruebas). No toca la red.
 */
export async function importWeekFromText(weekId: string, rawText: string, sourceUrl = "manual"): Promise<ImportResult> {
  const { items, warnings } = parseWolProgram(rawText, sourceUrl);
  return finalizeImport(weekId, items, warnings, { meetingsUrl: null, programUrl: sourceUrl });
}

async function finalizeImport(
  weekId: string,
  items: ParsedProgramItem[],
  warnings: string[],
  urls: { meetingsUrl: string | null; programUrl: string | null },
): Promise<ImportResult> {
  if (items.length === 0) {
    await prisma.jwMeetingWeek.update({
      where: { id: weekId },
      data: {
        importStatus: "IMPORT_FAILED",
        importError: warnings.join(" ") || "No se extrajo ninguna asignación.",
        wolProgramUrl: urls.programUrl ?? undefined,
      },
    });
    return { weekId, status: "IMPORT_FAILED", itemCount: 0, wolMeetingsUrl: urls.meetingsUrl, wolProgramUrl: urls.programUrl, warnings, error: "sin items" };
  }

  await persistItems(weekId, items, urls.programUrl ?? "");

  const incomplete = items.filter((i) => !itemLooksComplete(i));
  const status: "READY" | "NEEDS_REVIEW" = incomplete.length > 0 || warnings.length > 0 ? "NEEDS_REVIEW" : "READY";
  if (incomplete.length > 0) {
    warnings.push(`${incomplete.length} parte(s) con datos incompletos: ${incomplete.map((i) => i.title).join(", ")}.`);
  }

  await prisma.jwMeetingWeek.update({
    where: { id: weekId },
    data: {
      importStatus: status,
      importedAt: new Date(),
      importError: status === "NEEDS_REVIEW" ? warnings.join(" ") : null,
      wolProgramUrl: urls.programUrl ?? undefined,
      wolMeetingsUrl: urls.meetingsUrl ?? undefined,
    },
  });

  return { weekId, status, itemCount: items.length, wolMeetingsUrl: urls.meetingsUrl, wolProgramUrl: urls.programUrl, warnings };
}

/**
 * Importa el programa de una semana desde WOL de principio a fin.
 * Marca la semana IMPORTING mientras trabaja y READY/NEEDS_REVIEW/IMPORT_FAILED al terminar.
 */
export async function importWeekFromWol(weekId: string, fetcher: WolFetcher = defaultWolFetcher): Promise<ImportResult> {
  const week = await prisma.jwMeetingWeek.findUniqueOrThrow({ where: { id: weekId } });

  // Coordenadas WOL (usa las guardadas o las calcula desde la fecha de la semana).
  const dateForCoords = week.weekStartDateLocal || week.meetingDateLocal || week.weekStartDate;
  const coords = getWolWeekCoordinates(dateForCoords as any);
  const meetingsUrl = week.wolMeetingsUrl || coords.meetingsUrl;

  await prisma.jwMeetingWeek.update({
    where: { id: weekId },
    data: {
      importStatus: "IMPORTING",
      isoYear: coords.year,
      isoWeekNumber: coords.weekNumber,
      wolMeetingsUrl: meetingsUrl,
      importError: null,
    },
  });

  try {
    const meetingsHtml = await fetcher(meetingsUrl);
    const programUrl = findVidaYMinisterioLink(meetingsHtml, meetingsUrl);
    if (!programUrl) {
      throw new Error("No se encontró el enlace de Vida y Ministerio en la página de reuniones.");
    }

    const programHtml = await fetcher(programUrl);
    const text = htmlToText(programHtml);
    const { items, warnings } = parseWolProgram(text, programUrl);
    return finalizeImport(weekId, items, warnings, { meetingsUrl, programUrl });
  } catch (err: any) {
    await prisma.jwMeetingWeek.update({
      where: { id: weekId },
      data: { importStatus: "IMPORT_FAILED", importError: err?.message || String(err) },
    });
    return {
      weekId,
      status: "IMPORT_FAILED",
      itemCount: 0,
      wolMeetingsUrl: meetingsUrl,
      wolProgramUrl: null,
      warnings: [],
      error: err?.message || String(err),
    };
  }
}
