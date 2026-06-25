import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDaysToLocalDate,
  calculateReminderScheduledAt,
  dateToLocalDateString,
  zonedLocalTimeToUtc,
} from "./date-utils.js";

// Source of truth: docs/AUTOMATION-MODEL-FIX.md -> "Casos de prueba minimos" / "Fechas, zona horaria y UTC"
const TZ = "America/Mexico_City";
const SEND_HOUR = 9;
const MEETING_DATE_LOCAL = "2026-07-03";
const MEETING_TIME = "19:00";

test("Caso 1 - asignado: scheduledAt UTC para reunion 2026-07-03 19:00 CDMX, envio 09:00", () => {
  const cases: Array<[string, string]> = [
    ["SEVEN_DAYS_BEFORE", "2026-06-26T15:00:00.000Z"],
    ["THREE_DAYS_BEFORE", "2026-06-30T15:00:00.000Z"],
    ["ONE_DAY_BEFORE", "2026-07-02T15:00:00.000Z"],
    ["SAME_DAY", "2026-07-03T15:00:00.000Z"],
  ];

  for (const [reminderType, expectedIso] of cases) {
    const scheduledAt = calculateReminderScheduledAt({
      meetingDateLocal: MEETING_DATE_LOCAL,
      meetingTime: MEETING_TIME,
      reminderType: reminderType as any,
      timezone: TZ,
      sendHour: SEND_HOUR,
    });
    assert.equal(
      scheduledAt.toISOString(),
      expectedIso,
      `${reminderType} debe programarse a ${expectedIso}`,
    );
  }
});

test("INITIAL_NOTICE / CHANGE_NOTICE / CANCELLATION_NOTICE se programan inmediatos (now)", () => {
  const now = new Date("2026-06-01T18:00:00.000Z");
  for (const reminderType of ["INITIAL_NOTICE", "CHANGE_NOTICE", "CANCELLATION_NOTICE"]) {
    const scheduledAt = calculateReminderScheduledAt({
      meetingDateLocal: MEETING_DATE_LOCAL,
      meetingTime: MEETING_TIME,
      reminderType: reminderType as any,
      timezone: TZ,
      sendHour: SEND_HOUR,
      now,
    });
    assert.equal(scheduledAt.toISOString(), now.toISOString(), `${reminderType} debe usar now`);
  }
});

test("SAME_DAY rechaza sendHour >= meetingTime", () => {
  assert.throws(
    () =>
      calculateReminderScheduledAt({
        meetingDateLocal: MEETING_DATE_LOCAL,
        meetingTime: "08:00",
        reminderType: "SAME_DAY" as any,
        timezone: TZ,
        sendHour: 9,
      }),
    /earlier than meetingTime/,
  );
});

test("addDaysToLocalDate respeta limites de mes sin desfase UTC", () => {
  assert.equal(addDaysToLocalDate("2026-07-03", -7), "2026-06-26");
  assert.equal(addDaysToLocalDate("2026-06-30", 1), "2026-07-01");
  assert.equal(addDaysToLocalDate("2026-12-31", 1), "2027-01-01");
});

test("zonedLocalTimeToUtc convierte hora local CDMX a UTC (UTC-6 en 2026)", () => {
  assert.equal(
    zonedLocalTimeToUtc("2026-07-03", 9, 0, TZ).toISOString(),
    "2026-07-03T15:00:00.000Z",
  );
});

test("dateToLocalDateString extrae YYYY-MM-DD", () => {
  assert.equal(dateToLocalDateString(new Date("2026-07-03T05:00:00.000Z")), "2026-07-03");
  assert.equal(dateToLocalDateString("2026-07-03T00:00:00.000Z"), "2026-07-03");
});
