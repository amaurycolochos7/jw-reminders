import { prisma } from "@jw-reminders/database";
import { validatePublisherCapabilities } from "@jw-reminders/shared";

const MX_PREFIX = "521";

/**
 * Normalizes a phone number for WhatsApp (international format).
 * - Strips spaces, dashes, parentheses, plus signs.
 * - If already has 521 prefix and is 13 digits, keep as-is.
 * - If 10 digits (national), prepend 521.
 * - Validates the national portion is 10 digits.
 */
export function normalizePhone(raw: string): string {
  // Strip non-digit chars
  let cleaned = raw.replace(/[\s\-\(\)\+]/g, "");

  // If starts with +52 or 52 but not 521, add the 1
  if (cleaned.startsWith("52") && !cleaned.startsWith("521") && cleaned.length === 12) {
    cleaned = "521" + cleaned.slice(2);
  }

  // If already has 521 prefix (13 digits total)
  if (cleaned.startsWith(MX_PREFIX) && cleaned.length === 13) {
    return cleaned;
  }

  // If 10 digits (national number), prepend 521
  if (cleaned.length === 10) {
    return MX_PREFIX + cleaned;
  }

  // If 11 digits starting with 1 (user typed 1 + 10 digits), prepend 52
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return "52" + cleaned;
  }

  // Fallback: return cleaned (validation will catch issues)
  return cleaned;
}

/**
 * Extracts the national (10-digit) phone from an international number.
 * 5219610000004 → 9610000004
 */
export function toNationalPhone(international: string): string {
  if (international.startsWith(MX_PREFIX) && international.length === 13) {
    return international.slice(3);
  }
  if (international.length === 10) {
    return international;
  }
  return international;
}

/**
 * Validates that the phone resolves to a valid 10-digit national number.
 */
export function validatePhone(raw: string): { valid: boolean; error?: string; normalized: string } {
  const cleaned = raw.replace(/[\s\-\(\)\+]/g, "");
  const normalized = normalizePhone(cleaned);
  const national = toNationalPhone(normalized);

  if (national.length !== 10) {
    return { valid: false, error: "El telefono debe tener 10 digitos nacionales", normalized };
  }
  if (!/^\d+$/.test(national)) {
    return { valid: false, error: "El telefono solo debe contener numeros", normalized };
  }
  return { valid: true, normalized };
}

export async function listPublishers(search?: string, includeDeleted = false) {
  const where: any = {};

  // Filter out soft-deleted unless explicitly requested
  if (!includeDeleted) {
    where.deletedAt = null;
  }

  if (search) {
    const normalizedSearch = search.replace(/[\s\-\(\)\+]/g, "");
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { displayName: { contains: search, mode: "insensitive" } },
      { phone: { contains: normalizedSearch } },
    ];
  }

  return prisma.jwPublisher.findMany({
    where,
    orderBy: { fullName: "asc" },
  });
}

export async function getPublisher(id: string) {
  return prisma.jwPublisher.findUniqueOrThrow({ where: { id } });
}

export async function createPublisher(data: any) {
  // Normalize phone
  const phoneValidation = validatePhone(data.phone);
  if (!phoneValidation.valid) {
    throw new Error(phoneValidation.error);
  }
  data.phone = phoneValidation.normalized;
  data.whatsappPhone = data.whatsappPhone
    ? normalizePhone(data.whatsappPhone)
    : data.phone;

  // Strong validation of congregational status + capabilities (strict rules).
  const capErrors = validatePublisherCapabilities(data);
  if (capErrors.length > 0) {
    throw new Error(capErrors.join(" "));
  }

  return prisma.jwPublisher.create({ data });
}

export async function updatePublisher(id: string, data: any) {
  // Normalize phone if provided
  if (data.phone) {
    const phoneValidation = validatePhone(data.phone);
    if (!phoneValidation.valid) {
      throw new Error(phoneValidation.error);
    }
    data.phone = phoneValidation.normalized;
  }
  if (data.whatsappPhone) {
    data.whatsappPhone = normalizePhone(data.whatsappPhone);
  }

  // Validate the MERGED state: partial updates must be checked against the
  // publisher's current gender/appointment/capabilities so strict rules can't
  // be bypassed by sending only some fields.
  const current = await prisma.jwPublisher.findUniqueOrThrow({ where: { id } });
  const merged = { ...current, ...data };
  const capErrors = validatePublisherCapabilities(merged);
  if (capErrors.length > 0) {
    throw new Error(capErrors.join(" "));
  }

  return prisma.jwPublisher.update({ where: { id }, data });
}

export async function toggleActive(id: string) {
  const pub = await prisma.jwPublisher.findUniqueOrThrow({ where: { id } });
  return prisma.jwPublisher.update({ where: { id }, data: { isActive: !pub.isActive } });
}

export async function restorePublisher(id: string) {
  return prisma.jwPublisher.update({
    where: { id },
    data: {
      isActive: true,
      canReceiveAssignments: true,
      canBeCompanion: true,
      deletedAt: null,
    },
  });
}

export async function deletePublisher(id: string) {
  const pub = await prisma.jwPublisher.findUniqueOrThrow({
    where: { id },
    include: {
      _count: {
        select: {
          assignedAssignments: true,
          companionAssignments: true,
          reminders: true,
          reminderDeliveries: true,
          messageLogs: true,
        },
      },
    },
  });

  const hasHistory =
    pub._count.assignedAssignments > 0 ||
    pub._count.companionAssignments > 0 ||
    pub._count.reminders > 0 ||
    pub._count.reminderDeliveries > 0 ||
    pub._count.messageLogs > 0;

  if (hasHistory) {
    // Soft delete: deactivate and mark deleted
    return prisma.jwPublisher.update({
      where: { id },
      data: {
        isActive: false,
        canReceiveAssignments: false,
        canBeCompanion: false,
        deletedAt: new Date(),
      },
    });
  } else {
    // Hard delete: no history
    return prisma.jwPublisher.delete({ where: { id } });
  }
}
