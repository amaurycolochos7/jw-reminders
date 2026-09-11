'use client';
import { useState, useEffect } from 'react';
import { COMMENT_LABELS, MODE_LABELS, QUESTION_TYPE_LABELS } from '../utils/constants';
import { getCommentType, getCommentSources, getCommentVariants } from '../utils/helpers';
import type { AssistantResponse } from '../types/index';
import { SourceCard } from './SourceCard';

export function AssistantCard({
  response,
  messageId,
  onQuickAction,
  onGenerateMoreVariants,
  variantLoadingKey,
}: {
  response?: AssistantResponse;
  messageId?: string;
  onQuickAction: (i: string) => void;
  onGenerateMoreVariants?: (messageId: string, commentType: string) => void;
  variantLoadingKey?: string | null;
}) {
  const [activeTab, setActiveTab] = useState(1);
  const [activeVariant, setActiveVariant] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [adjustMenu, setAdjustMenu] = useState(false);

  useEffect(() => { setActiveVariant(0); }, [activeTab]);

  if (!response) return null;

  const comments = response.comments || [];

  function copyComment(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const activeCommentGroup = comments[activeTab] || comments[0];
  const activeCommentType = activeCommentGroup ? getCommentType(activeCommentGroup) : null;
  const activeVariants = activeCommentGroup ? getCommentVariants(activeCommentGroup) : [];
  const activeComment = activeVariants[activeVariant] || activeVariants[0];
  const variantKey = messageId && activeCommentType ? `${messageId}:${activeCommentType}` : null;
  const isGeneratingVariants = Boolean(variantKey && variantLoadingKey === variantKey);
  const usedSources = response.usedSources || [];
  const unusedSources = response.detectedButUnusedSources || [];
  const unresolvedExplicit = response.unresolvedExplicitRefs || [];

  return (
    <div className="space-y-3">
      {/* Header badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {response.mode && MODE_LABELS[response.mode] && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gpt-sidebar border border-gpt-hairline text-gpt-ink">
            {MODE_LABELS[response.mode]}
          </span>
        )}
        {response.questionType && QUESTION_TYPE_LABELS[response.questionType] && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gpt-sidebar border border-gpt-hairline text-gpt-ash">
            {QUESTION_TYPE_LABELS[response.questionType]}
          </span>
        )}
        {response.sourceVerificationStatus === 'VERIFIED' && usedSources.length > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 border border-green-100 text-green-700">
            Fuente verificada
          </span>
        )}
        {response.sourceVerificationStatus === 'PARTIAL' && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 text-amber-700">
            Verificacion parcial
          </span>
        )}
        {response.sourceVerificationStatus === 'UNVERIFIED' && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 border border-red-100 text-red-600">
            Referencia no verificada
          </span>
        )}
        {response.sourceVerificationStatus === 'AI_SUGGESTED' && usedSources.length > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gpt-sidebar border border-gpt-hairline text-gpt-ash">
            Fuentes sugeridas
          </span>
        )}
        {!response.sourceVerificationStatus && usedSources.length > 0 && unresolvedExplicit.length === 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 border border-green-100 text-green-700">
            {usedSources.length} fuente{usedSources.length > 1 ? 's' : ''} con texto real
          </span>
        )}
      </div>

      {/* Precursor study context */}
      {response.matchedStudyContext && (
        <div className="text-[12px] text-gpt-ash bg-gpt-sidebar rounded-xl px-3 py-2 border border-gpt-hairline">
          <span className="font-medium text-gpt-ink">{response.matchedStudyContext.lesson}</span>
          <span className="mx-1.5">&middot;</span>
          <span>{response.matchedStudyContext.day}</span>
        </div>
      )}

      {/* Summary */}
      {response.summary && (
        <p className="text-[14px] text-gpt-ink leading-relaxed">{response.summary}</p>
      )}

      {/* Detected questions */}
      {response.parsedQuestion && response.parsedQuestion.questionCount > 1 && (
        <div className="space-y-1">
          <h4 className="text-[11px] font-semibold text-gpt-hollow uppercase tracking-wider">Preguntas detectadas</h4>
          <ol className="list-decimal list-inside text-[12px] text-gpt-ink space-y-0.5">
            {response.parsedQuestion.subQuestions.map((q: any, i: number) => (
              <li key={i}>{q.text}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Unverified source warning */}
      {response.sourceVerificationStatus === 'UNVERIFIED' && (
        <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No se pudo verificar la referencia explicita. El comentario se genero como borrador y debe revisarse.
        </div>
      )}

      {/* Biblical basis */}
      {response.biblicalBasis && response.biblicalBasis.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-semibold text-gpt-hollow uppercase tracking-wider">
            {response.sourceVerificationStatus === 'VERIFIED' || response.sourceVerificationStatus === 'PARTIAL'
              ? 'Textos citados en la fuente'
              : 'Base bíblica'}
          </h4>
          {response.biblicalBasis.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-[13px]">
              <span className="shrink-0 text-blue-600 font-medium">{b.reference}</span>
              <span className="text-gpt-ink">— {b.text}</span>
            </div>
          ))}
        </div>
      )}
      {response.sourceVerificationStatus === 'VERIFIED' && (!response.biblicalBasis || response.biblicalBasis.length === 0) && usedSources.length > 0 && usedSources.some(s => s.type !== 'bible') && (
        <p className="text-[11px] text-gpt-ash italic">La referencia principal no cita un texto bíblico directo para esta pregunta.</p>
      )}

      {/* Additional references */}
      {response.additionalReferences && response.additionalReferences.length > 0 && response.sourceVerificationStatus !== 'UNVERIFIED' && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-semibold text-gpt-hollow uppercase tracking-wider">
            Referencias sugeridas <span className="font-normal text-gpt-ash">(generado por IA)</span>
          </h4>
          {response.additionalReferences.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-[13px]">
              <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded ${r.source === 'precursor' ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-600'}`}>
                {r.source === 'precursor' ? 'PRE' : 'REF'}
              </span>
              <div>
                <span className="text-gpt-ink font-medium">{r.reference}</span>
                {r.note && <span className="text-gpt-ash ml-1.5">— {r.note}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Application */}
      {response.application && (
        <div className="space-y-1">
          <h4 className="text-[11px] font-semibold text-gpt-hollow uppercase tracking-wider">Aplicación</h4>
          <p className="text-[13px] text-gpt-ink leading-relaxed">{response.application}</p>
        </div>
      )}

      {/* Confidence note */}
      {response.confidenceNote && (
        <p className="text-[11px] text-gpt-ash italic bg-gpt-sidebar rounded-lg px-3 py-1.5 border border-gpt-hairline">
          {response.confidenceNote}
        </p>
      )}

      {/* Comments with tabs */}
      {comments.length > 0 && (
        <div className="border border-gpt-hairline rounded-xl overflow-hidden">
          <div className="flex border-b border-gpt-hairline bg-gpt-sidebar overflow-x-auto gpt-scrollbar">
            {comments.map((c, idx) => {
              const type = getCommentType(c);
              const isActive = idx === activeTab;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  className={`shrink-0 px-3.5 py-2 text-[12px] font-medium transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 focus-visible:ring-inset ${
                    isActive
                      ? 'border-gpt-ink text-gpt-ink bg-gpt-white'
                      : 'border-transparent text-gpt-hollow hover:text-gpt-ink'
                  }`}
                >
                  {COMMENT_LABELS[type] || type} <span className="text-gpt-hollow font-normal">{c.durationSeconds}s</span>
                </button>
              );
            })}
          </div>

          {(activeVariants.length > 1 || onGenerateMoreVariants) && (
            <div className="flex items-center gap-1.5 px-4 pt-2.5 flex-wrap">
              {activeVariants.length > 1 && activeVariants.map((_, vIdx) => (
                <button
                  key={vIdx}
                  onClick={() => setActiveVariant(vIdx)}
                  aria-label={`Variante ${vIdx + 1}`}
                  className={`w-5 h-5 rounded-full text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 ${
                    vIdx === activeVariant ? 'bg-gpt-accent text-gpt-on-accent' : 'bg-gpt-sidebar text-gpt-hollow hover:text-gpt-ink'
                  }`}
                >
                  {vIdx + 1}
                </button>
              ))}
              {onGenerateMoreVariants && messageId && activeCommentType && (
                <button
                  onClick={() => onGenerateMoreVariants(messageId, activeCommentType)}
                  disabled={isGeneratingVariants}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-gpt-hairline text-gpt-ash hover:text-gpt-ink hover:bg-gpt-hover transition-colors disabled:opacity-50 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
                >
                  {isGeneratingVariants ? 'Generando…' : '+ Generar más'}
                </button>
              )}
            </div>
          )}

          {activeComment && (
            <div className="px-4 py-3.5">
              <p className="text-[14px] text-gpt-ink leading-[1.6] whitespace-pre-wrap">{activeComment.text}</p>

              {getCommentSources(activeComment).length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {getCommentSources(activeComment).map((ref, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 bg-gpt-sidebar rounded-lg border border-gpt-hairline text-gpt-ash" title="Fuente usada en este comentario">
                      {ref}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 relative">
                <button
                  onClick={() => copyComment(activeComment.text, activeTab * 100 + activeVariant)}
                  className="text-[12px] px-3 py-1.5 rounded-lg border border-gpt-hairline text-gpt-ink hover:bg-gpt-hover active:bg-black/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
                >
                  {copiedIdx === activeTab * 100 + activeVariant ? '✓ Copiado' : 'Copiar'}
                </button>
                <button
                  onClick={() => setAdjustMenu(!adjustMenu)}
                  aria-pressed={adjustMenu}
                  className="text-[12px] px-3 py-1.5 rounded-lg border border-gpt-hairline text-gpt-ink hover:bg-gpt-hover active:bg-black/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
                >
                  Ajustar ▾
                </button>
                {adjustMenu && (
                  <div className="absolute left-16 bottom-full mb-1 bg-gpt-white border border-gpt-hairline rounded-xl shadow-elevated py-1 z-10 min-w-[180px]">
                    {['Más sencillo', 'Más profundo', 'Más corto', 'Más natural', 'Otro enfoque', 'Comentario de 15 segundos', 'Comentario de 30 segundos'].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setAdjustMenu(false); onQuickAction(opt); }}
                        className="w-full text-left px-3 py-1.5 text-[13px] text-gpt-ink hover:bg-gpt-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 focus-visible:ring-inset"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Verified sources */}
      {usedSources.length > 0 && response.sourceVerificationStatus !== 'UNVERIFIED' && (
        <div className="border border-gpt-hairline rounded-xl overflow-hidden">
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            aria-expanded={sourcesExpanded}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[12px] font-medium text-gpt-ink hover:bg-gpt-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 focus-visible:ring-inset"
          >
            <span>
              {usedSources.length === 1 ? 'Fuente principal verificada' : `Fuentes verificadas (${usedSources.length})`}
              {' — texto extraído de fuente real'}
            </span>
            <span className="text-gpt-hollow">{sourcesExpanded ? '▾' : '▸'}</span>
          </button>
          {sourcesExpanded && (
            <div className="border-t border-gpt-hairline divide-y divide-gpt-hairline">
              {usedSources.map((src, idx) => (
                <SourceCard key={idx} source={src} isPrimary={idx === 0 && usedSources.length <= 3} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unresolved explicit references */}
      {unresolvedExplicit.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl px-3 py-2.5 space-y-1.5">
          <h4 className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
            {unresolvedExplicit.length === 1 ? 'Referencia explícita no resuelta' : 'Referencias explícitas no resueltas'}
          </h4>
          {unresolvedExplicit.map((s, i) => (
            <div key={i} className="text-[12px]">
              <span className="text-amber-800 font-medium">{s.reference}</span>
              {s.reason && <p className="text-amber-600 text-[11px] mt-0.5">{s.reason}</p>}
              {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-amber-700 underline hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded">Buscar en JW.org ↗</a>}
            </div>
          ))}
        </div>
      )}

      {/* Other unused sources */}
      {unusedSources.length > 0 && (
        <div className="text-[11px] text-gpt-hollow px-1">
          <span className="font-medium">Fuentes complementarias no incorporadas:</span>{' '}
          {unusedSources.map((s, i) => (
            <span key={i}>
              {s.reference}
              {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-1 underline hover:text-gpt-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 rounded">↗</a>}
              {i < unusedSources.length - 1 && ', '}
            </span>
          ))}
        </div>
      )}

      {/* Warnings */}
      {response.warnings.length > 0 && (
        <div className="text-[12px] text-gpt-ash bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2">
          {response.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* Follow-up suggestions */}
      {response.followUpSuggestions && response.followUpSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {response.followUpSuggestions.slice(0, 4).map((s, i) => (
            <button
              key={i}
              onClick={() => onQuickAction(s)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gpt-hairline text-gpt-ash hover:text-gpt-ink hover:bg-gpt-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
