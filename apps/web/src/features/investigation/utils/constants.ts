import type { LoadingStep } from '../types/index';

export const LOADING_MESSAGES: Record<LoadingStep, string> = {
  idle: '',
  reading: 'Analizando pregunta…',
  detecting: 'Detectando referencias…',
  resolving: 'Consultando JW.org…',
  generating: 'Preparando comentarios…',
  done: 'Listo',
};

export const COMMENT_LABELS: Record<string, string> = {
  directo: 'Directo',
  natural: 'Natural',
  razonado: 'Razonado',
  profundo: 'Profundo',
  sencillo: 'Directo',
  medio: 'Natural',
  precursor: 'Profundo',
};

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  definicion_sencilla: 'Definición sencilla',
  explicacion_basica: 'Explicación básica',
  razonamiento_espiritual: 'Razonamiento espiritual',
  aplicacion_personal: 'Aplicación personal',
  analisis_multifuente: 'Análisis con varias fuentes',
  busqueda_tematica: 'Búsqueda temática',
  preparacion_reunion: 'Preparación para reunión',
};

export const MODE_LABELS: Record<string, string> = {
  investigacion: '🔍 Investigación',
  comentario: 'Comentario',
  precursor: 'Precursor',
  sencillo: '📝 Sencillo',
  referencias: '📋 Referencias',
  profundo: '🔬 Profundo',
  perla: '💎 Perla espiritual',
};
