'use client';
import { useState, useEffect, useRef } from 'react';
import type { UsedSource, ExtractedParagraph } from '../types/index';
import { resolveSource } from '../services/api';
import { HighlightedText } from './HighlightedText';

export function SourceCard({ source, isPrimary }: { source: UsedSource; isPrimary?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadedContent, setReloadedContent] = useState<ExtractedParagraph[] | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const contentItems = reloadedContent || source.extractedContent || [];
  const hasFullText = contentItems.length > 0 && contentItems.some((p) => (p.text || '').length > 100);
  const hasOnlyPreview = contentItems.length > 0 && !hasFullText;
  const hasContent = contentItems.length > 0;

  const isBible = source.type === 'bible';
  const isWol = source.type === 'wol' || source.type === 'wol_link';

  const autoResolvedRef = useRef(false);
  useEffect(() => {
    if (isBible && hasOnlyPreview && !reloadedContent && !reloading && !autoResolvedRef.current) {
      autoResolvedRef.current = true;
      reloadContent();
    }
  }, [isBible, hasOnlyPreview, reloadedContent, reloading]);

  let typeLabel = 'Fuente';
  let titleDisplay: string | null = null;
  let originLabel: string | null = null;
  let viewButtonLabel = 'Ver contenido';
  let metadataNote: string | null = null;

  if (isBible) {
    typeLabel = 'Biblia';
    titleDisplay = 'Traducción del Nuevo Mundo';
    originLabel = 'Biblia local verificada';
    viewButtonLabel = 'Ver texto bíblico';
  } else if (isWol) {
    typeLabel = source.publication || 'Publicación';
    if (source.title && source.title !== source.reference && source.title.length > 5) {
      titleDisplay = source.title;
    }
    if (source.sourceOrigin === 'precursor_metadata' && !hasFullText) {
      originLabel = 'Índice del libro de precursores';
      viewButtonLabel = 'Ver referencia del libro';
      metadataNote = 'Referencia localizada por índice del libro; el texto completo del párrafo no está disponible en la base local.';
    } else if (hasFullText) {
      originLabel = 'Contenido verificado de JW.org';
      viewButtonLabel = 'Ver contenido extraído';
    }
  } else {
    typeLabel = 'Texto del usuario';
    viewButtonLabel = 'Ver texto';
  }

  async function reloadContent() {
    if (reloading) return;
    setReloading(true);
    setReloadError(null);
    try {
      const data = await resolveSource(source.reference);
      if (data && data.extractedContent?.length > 0) setReloadedContent(data.extractedContent);
      else setReloadError('No se pudo recargar el contenido');
    } catch {
      setReloadError('Error de conexión');
    } finally {
      setReloading(false);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span className={`shrink-0 mt-0.5 text-[12px] font-medium px-1.5 py-0.5 rounded ${isBible ? 'bg-blue-50 text-blue-600' : isWol ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-600'}`}>
          {isBible ? 'BIB' : isWol ? 'PUB' : 'TXT'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] text-gpt-ink font-medium">{source.reference}</span>
            <span className="text-[11px] text-gpt-hollow">{typeLabel}</span>
            {isPrimary && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-100 font-medium">PRINCIPAL</span>}
          </div>
          {titleDisplay && (
            <p className="text-[12px] text-gpt-ash mt-0.5">{titleDisplay}</p>
          )}
          {originLabel && (
            <p className="text-[11px] text-green-600 mt-0.5">✓ {originLabel}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {hasContent && (
              <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="text-[11px] px-2 py-0.5 rounded-lg border border-gpt-hairline text-gpt-ink hover:bg-gpt-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20">
                {expanded ? 'Ocultar' : viewButtonLabel}
              </button>
            )}
            {source.url && (
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-gpt-ash hover:text-gpt-ink underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 rounded">
                {isBible ? 'Abrir en JW.org ↗' : source.urlType === 'direct' ? 'Abrir en JW.org ↗' : 'Buscar en JW.org ↗'}
              </a>
            )}
          </div>
        </div>
      </div>

      {expanded && hasContent && (
        <div className="mt-2.5 ml-8 border border-gpt-hairline rounded-lg bg-gpt-sidebar overflow-hidden">
          {hasFullText && (
            <div className="divide-y divide-gpt-hairline">
              {contentItems.map((para, idx) => (
                <div key={idx} className="px-3 py-2">
                  <span className="text-[10px] font-semibold text-gpt-hollow uppercase">{para.label}</span>
                  <p className="text-[13px] text-gpt-ink leading-relaxed mt-0.5">
                    <HighlightedText text={para.text || para.textPreview || ''} highlights={para.highlights || []} />
                  </p>
                </div>
              ))}
            </div>
          )}
          {metadataNote && (
            <div className="px-3 py-2 border-t border-gpt-hairline">
              <p className="text-[10px] text-gpt-hollow italic">{metadataNote}</p>
            </div>
          )}
          {hasOnlyPreview && !reloading && (
            <div className="px-3 py-3 text-center">
              <p className="text-[11px] text-gpt-hollow mb-1.5">
                {isBible ? 'Texto bíblico no cargado.' : 'Contenido no disponible en caché.'}
              </p>
              <button onClick={reloadContent} className="text-[11px] px-2.5 py-1 rounded-lg border border-gpt-hairline text-gpt-ink hover:bg-gpt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20">
                {isBible ? 'Cargar texto bíblico' : 'Recargar desde JW.org'}
              </button>
            </div>
          )}
          {reloading && <p className="px-3 py-2.5 text-[11px] text-gpt-ash animate-pulse text-center">Cargando…</p>}
          {reloadError && <p className="px-3 py-2 text-[11px] text-gpt-ash">⚠️ {reloadError}</p>}
        </div>
      )}
    </div>
  );
}
