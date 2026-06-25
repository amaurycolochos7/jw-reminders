import { ReminderType } from "@jw-reminders/database";

export const DEFAULT_TIMEZONE = "America/Mexico_City";
export const DEFAULT_SEND_HOUR = 9;

type ReminderScheduleInput = {
  meetingDateLocal: string;
  meetingTime: string;
  reminderType: ReminderType;
  timezone?: string;
  sendHour?: number;
  now?: Date;
};

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid local date: ${date}`);
  }
  return { year, month, day };
}

function parseLocalTime(time: string) {
  const [hourRaw, minuteRaw = "0"] = time.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || hour < 0 || hour > 23 || Number.isNaN(minute) || minute < 0 || minute > 59) {
    throw new Error(`Invalid local time: ${time}`);
  }
  return { hour, minute };
}

export function dateToLocalDateString(date: Date | string): string {
  if (typeof date === "string") {
    return date.split("T")[0] || date;
  }
  return date.toISOString().slice(0, 10);
}

export function addDaysToLocalDate(date: string, days: number): string {
  const { year, month, day } = parseLocalDate(date);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }

  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour === 24 ? 0 : values.hour,
    values.minute,
    values.second,
  );

  return asUtc - instant.getTime();
}

export function zonedLocalTimeToUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(date);
  const localUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = new Date(localUtc);

  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(candidate, timeZone);
    candidate = new Date(localUtc - offset);
  }

  return candidate;
}

export function calculateReminderScheduledAt(input: ReminderScheduleInput): Date {
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const sendHour = input.sendHour ?? DEFAULT_SEND_HOUR;

  if (input.reminderType === "INITIAL_NOTICE" || input.reminderType === "CHANGE_NOTICE" || input.reminderType === "CANCELLATION_NOTICE") {
    return input.now || new Date();
  }

  const offsets: Record<string, number> = {
    SEVEN_DAYS_BEFORE: -7,
    THREE_DAYS_BEFORE: -3,
    ONE_DAY_BEFORE: -1,
    SAME_DAY: 0,
  };

  const offset = offsets[input.reminderType];
  if (offset === undefined) {
    throw new Error(`Unsupported reminder type: ${input.reminderType}`);
  }

  const { hour: meetingHour } = parseLocalTime(input.meetingTime);
  if (input.reminderType === "SAME_DAY" && sendHour >= meetingHour) {
    throw new Error("REMINDER_SEND_HOUR must be earlier than meetingTime for SAME_DAY reminders");
  }

  const scheduledLocalDate = addDaysToLocalDate(input.meetingDateLocal, offset);
  return zonedLocalTimeToUtc(scheduledLocalDate, sendHour, 0, timezone);
}




/**
 * Local calendar day (YYYY-MM-DD) in the given IANA timezone for "now".
 */
export function localToday(timeZone: string): string {
  return localDateLabel(new Date(), timeZone);
}

/**
 * Local calendar day (YYYY-MM-DD) of an instant in the given IANA timezone.
 */
export function localDateLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Local 24h time (HH:mm) of an instant in the given IANA timezone.
 */
export function localTimeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
