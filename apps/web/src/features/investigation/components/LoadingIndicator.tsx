'use client';
import { useState, useEffect, useRef } from 'react';
import type { LoadingStep } from '../types/index';

const PHRASES = [
  'Analizando pregunta…',
  'Detectando referencias…',
  'Consultando JW.org…',
  'Verificando fuentes…',
  'Preparando comentarios…',
];

const STEP_MAP: Record<LoadingStep, number> = {
  idle: 0,
  reading: 0,
  detecting: 1,
  resolving: 2,
  generating: 4,
  done: 4,
};

export function LoadingIndicator({ step }: { step: LoadingStep }) {
  const [idx, setIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const baseIdx = STEP_MAP[step] || 0;
  const idxRef = useRef(idx);
  idxRef.current = idx;

  useEffect(() => {
    if (baseIdx !== idxRef.current) {
      setPrevIdx(idxRef.current);
      setIdx(baseIdx);
    }
  }, [baseIdx]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIdx((prev) => {
        const next = prev + 1 < PHRASES.length ? prev + 1 : prev;
        if (next !== prev) setPrevIdx(prev);
        return next;
      });
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 px-1 py-1">
      <div className="flex gap-[3px] shrink-0">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-[7px] h-[7px] rounded-full bg-gpt-accent/50"
            style={{
              animation: 'loadingDot 1.2s ease-in-out infinite',
              animationDelay: `${i * 120}ms`,
            }}
          />
        ))}
      </div>
      <div className="relative h-5 min-w-[220px] overflow-hidden">
        {prevIdx !== null && (
          <span
            key={`prev-${prevIdx}`}
            className="absolute inset-0 flex items-center text-[14px] font-medium text-gpt-ink/80 whitespace-nowrap"
            style={{ animation: 'textExitUp 650ms cubic-bezier(0.4, 0, 0.2, 1) forwards' }}
            onAnimationEnd={() => setPrevIdx(null)}
          >
            {PHRASES[prevIdx]}
          </span>
        )}
        <span
          key={`cur-${idx}`}
          className="absolute inset-0 flex items-center text-[14px] font-medium text-gpt-ink/80 whitespace-nowrap"
          style={{ animation: 'textEnterUp 650ms cubic-bezier(0.4, 0, 0.2, 1) both' }}
        >
          {PHRASES[idx]}
        </span>
      </div>
    </div>
  );
}
