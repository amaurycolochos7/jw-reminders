import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(
  here,
  "../../../../../packages/database/prisma/migrations/20260701120000_p7_wol_program_import/migration.sql",
);

const sql = readFileSync(MIGRATION, "utf8");

// Tablas que ya existen en producción: agregar una columna NOT NULL sin DEFAULT
// rompería con datos legacy. Las tablas nuevas (MeetingProgramItem, NotificationLog)
// no tienen filas, así que sus NOT NULL son seguros.
const EXISTING_TABLES = ["JwMeetingWeek", "JwAssignment", "JwPublisher"];

test("la migración no agrega columnas NOT NULL sin DEFAULT a tablas existentes", () => {
  for (const table of EXISTING_TABLES) {
    const re = new RegExp(`ALTER TABLE "${table}"[\\s\\S]*?;`, "g");
    const blocks = sql.match(re) || [];
    for (const block of blocks) {
      // Cada ADD COLUMN dentro del bloque.
      const cols = block.match(/ADD COLUMN[^,;]*/g) || [];
      for (const col of cols) {
        if (/NOT NULL/i.test(col)) {
          assert.match(
            col,
            /DEFAULT/i,
            `Columna NOT NULL sin DEFAULT en tabla existente ${table}: ${col.trim()}`,
          );
        }
      }
    }
  }
});

test("programItemId se agrega como nullable en JwAssignment (compatible con legacy)", () => {
  assert.match(sql, /ALTER TABLE "JwAssignment" ADD COLUMN "programItemId" TEXT;/);
  // No debe ser NOT NULL.
  assert.doesNotMatch(sql, /"programItemId" TEXT NOT NULL/);
  // FK con ON DELETE SET NULL (no rompe si se borra el item).
  assert.match(sql, /JwAssignment_programItemId_fkey[\s\S]*ON DELETE SET NULL/);
});

test("importStatus se agrega con DEFAULT 'EMPTY' (seguro para filas existentes)", () => {
  assert.match(sql, /ADD COLUMN "importStatus" "WeekImportStatus" NOT NULL DEFAULT 'EMPTY'/);
});

test("las llaves únicas usan la estrategia estable acordada", () => {
  assert.match(sql, /UNIQUE INDEX "MeetingProgramItem_meetingWeekId_sortOrder_key" ON "MeetingProgramItem"\("meetingWeekId", "sortOrder"\)/);
  assert.match(sql, /UNIQUE INDEX "NotificationLog_assignmentId_recipientPersonId_notificationKey_key"/);
  assert.match(sql, /"notificationKey" TEXT NOT NULL/);
});
