import type { GeneratedComment, CommentVariant } from '../types/index';

export function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function getCommentType(c: GeneratedComment): string {
  return c.type || c.level || 'natural';
}

/** Normaliza mensajes viejos (comentario plano sin "variants") al formato nuevo. */
export function getCommentVariants(c: GeneratedComment): CommentVariant[] {
  if (Array.isArray(c.variants) && c.variants.length > 0) return c.variants;
  if (typeof c.text === 'string' && c.text) {
    return [{ text: c.text, whyItWorks: c.whyItWorks || '', usedSourceRefs: c.usedSourceRefs || c.usedSources || [] }];
  }
  return [];
}

export function getCommentSources(v: CommentVariant): string[] {
  return v.usedSourceRefs || [];
}

export function isDesktopViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
}
