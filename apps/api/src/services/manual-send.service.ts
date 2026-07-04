import { prisma } from "@jw-reminders/database";
import { renderMessage, sampleVariables, ACTIVE_TEMPLATE_TYPES, type TemplateTypeKey } from "@jw-reminders/shared";

const WA_URL = process.env.WHATSAPP_API_URL || "http://jw-reminders-whatsapp:3010";
const ACTIVE = new Set<string>(ACTIVE_TEMPLATE_TYPES);

/**
 * Fase 8 — Envío MANUAL / PRUEBA. NO crea batches ni ReminderDelivery: es un
 * envío puntual, aparte de las automatizaciones. Guardado por el mismo gate que
 * el worker (no envía si hay pausa manual o WhatsApp no está READY).
 */

export interface SendGuard { canSend: boolean; reason: string | null; whatsappStatus: string; manualPaused: boolean }

/** Estado de envío combinado (pausa manual AppConfig + readiness de WhatsApp). */
export async function getSendGuard(): Promise<SendGuard> {
  const cfg = await prisma.appConfig.findUnique({ where: { key: "SENDS_PAUSED" } });
  const manualPaused = cfg?.value === "true";
  let whatsappStatus = "UNREACHABLE";
  try {
    const r = await fetch(`${WA_URL}/status`, { headers: internalHeaders() });
    const data: any = await r.json();
    whatsappStatus = String(data?.status ?? "UNKNOWN");
  } catch { /* no responde */ }
  const canSend = !manualPaused && whatsappStatus === "READY";
  const reason = manualPaused ? "Envíos pausados manualmente" : whatsappStatus !== "READY" ? `WhatsApp no está listo (${whatsappStatus})` : null;
  return { canSend, reason, whatsappStatus, manualPaused };
}

/** Cabecera de auth interna hacia el servicio WhatsApp (Fase 9). */
function internalHeaders(): Record<string, string> {
  const token = process.env.WHATSAPP_INTERNAL_TOKEN;
  return token ? { "x-internal-token": token } : {};
}

function normalizePhoneDigits(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

async function doSend(phone: string, message: string, kind: "MANUAL" | "TEST"): Promise<{ sent: boolean; reason?: string; messageId?: string; outcome?: string }> {
  const guard = await getSendGuard();
  if (!guard.canSend) return { sent: false, reason: guard.reason || "No se puede enviar ahora" };

  const digits = normalizePhoneDigits(phone);
  if (digits.length < 10 || digits.length > 15) return { sent: false, reason: "Teléfono inválido (usa 10-15 dígitos)" };

  // Clave idempotente única por envío puntual (no se mezcla con automatizaciones).
  const idempotencyKey = `${kind.toLowerCase()}:${digits}:${Date.now()}`;
  try {
    const res = await fetch(`${WA_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders() },
      body: JSON.stringify({ phone: digits, message, idempotencyKey }),
    });
    const data: any = await res.json().catch(() => ({}));
    const sent = !!data?.success;
    // Log técnico mínimo (no forma parte del historial de automatizaciones).
    await prisma.jwMessageLog.create({
      data: { phone: digits, messageType: kind, messageBody: message, providerMessageId: data?.messageId || null, status: sent ? "SENT" : "FAILED", errorMessage: sent ? null : (data?.error || `HTTP ${res.status}`), sentAt: sent ? new Date() : null },
    }).catch(() => undefined);
    return { sent, reason: sent ? undefined : (data?.error || `HTTP ${res.status}`), messageId: data?.messageId, outcome: data?.outcome };
  } catch (e) {
    return { sent: false, reason: String(e) };
  }
}

/** Renderiza (SIN enviar) una plantilla activa para el mensaje de PRUEBA. */
export async function renderTemplateForTest(templateId: string, publisherId?: string) {
  const t = await prisma.jwMessageTemplate.findUniqueOrThrow({ where: { id: templateId } });
  const version = await prisma.messageTemplateVersion.findUnique({ where: { templateId_version: { templateId: t.id, version: t.activeVersion } } });
  const body = version?.body ?? t.body;
  const templateType = ACTIVE.has(t.type) ? (t.type as TemplateTypeKey) : undefined;

  const vars = sampleVariables();
  if (publisherId) {
    const p = await prisma.jwPublisher.findUnique({ where: { id: publisherId } });
    if (p) { vars.nombre = p.displayName || p.fullName; vars.telefono = p.whatsappPhone || p.phone; }
  }
  const r = renderMessage(body, vars, { templateType });
  return { rendered: r.renderedMessage, warnings: r.warnings, templateType: t.type, version: t.activeVersion, variables: vars };
}

/** Envía un mensaje de PRUEBA de una plantilla a un teléfono autorizado. */
export async function sendTemplateTest(input: { templateId: string; publisherId?: string; targetPhone: string }) {
  const preview = await renderTemplateForTest(input.templateId, input.publisherId);
  const result = await doSend(input.targetPhone, preview.rendered, "TEST");
  return { ...preview, sendResult: result };
}

/** Envía un mensaje MANUAL (texto libre o desde plantilla ya renderizada). */
export async function sendManual(input: { phone: string; message: string }) {
  if (!input.message || !input.message.trim()) return { sent: false, reason: "El mensaje está vacío" };
  const result = await doSend(input.phone, input.message, "MANUAL");
  return result;
}
