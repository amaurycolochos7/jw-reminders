/**
 * Validates Mexican phone number format.
 * Accepts: 10 digits, optional country code (52), optional +
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  return /^(\+?52)?[1-9]\d{9}$/.test(cleaned);
}

/**
 * Normalizes phone to WhatsApp format: 521XXXXXXXXXX
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, "");
  if (cleaned.length === 10) return `521${cleaned}`;
  if (cleaned.startsWith("52") && cleaned.length === 12) return `1${cleaned}`;
  if (cleaned.startsWith("521") && cleaned.length === 13) return cleaned;
  return cleaned;
}

/**
 * Validates time string in HH:mm format
 */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}
