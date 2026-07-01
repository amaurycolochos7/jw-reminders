import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  importStatusMeta,
  canGenerateParticipants,
  formatWeekRange,
  IMPORT_STATUS_META,
} from './week-program.js'

test('EMPTY muestra "Sin programa"', () => {
  assert.equal(importStatusMeta('EMPTY').label, 'Sin programa')
  assert.equal(IMPORT_STATUS_META.EMPTY.message, 'Esta semana todavía no tiene programa importado.')
})

test('READY muestra "Programa listo"', () => {
  assert.equal(importStatusMeta('READY').label, 'Programa listo')
  assert.equal(IMPORT_STATUS_META.READY.message, 'Programa listo.')
})

test('IMPORT_FAILED muestra error', () => {
  assert.equal(importStatusMeta('IMPORT_FAILED').label, 'Error al importar')
  assert.equal(importStatusMeta('IMPORT_FAILED').dot, 'red')
})

test('IMPORTING y NEEDS_REVIEW tienen etiquetas propias', () => {
  assert.equal(importStatusMeta('IMPORTING').label, 'Importando')
  assert.equal(importStatusMeta('NEEDS_REVIEW').label, 'Requiere revisión')
})

test('estado desconocido/nulo cae en EMPTY', () => {
  assert.equal(importStatusMeta(null).label, 'Sin programa')
  assert.equal(importStatusMeta(undefined).label, 'Sin programa')
  assert.equal(importStatusMeta('LO_QUE_SEA').label, 'Sin programa')
})

test('canGenerateParticipants sólo true en READY', () => {
  assert.equal(canGenerateParticipants('READY'), true)
  assert.equal(canGenerateParticipants('EMPTY'), false)
  assert.equal(canGenerateParticipants('IMPORTING'), false)
  assert.equal(canGenerateParticipants('NEEDS_REVIEW'), false)
  assert.equal(canGenerateParticipants('IMPORT_FAILED'), false)
  assert.equal(canGenerateParticipants(null), false)
})

test('formatWeekRange produce "29 de junio a 5 de julio"', () => {
  assert.equal(formatWeekRange('2026-06-29T00:00:00.000Z'), '29 de junio a 5 de julio')
  assert.equal(formatWeekRange('2026-06-29', '2026-07-05'), '29 de junio a 5 de julio')
})
