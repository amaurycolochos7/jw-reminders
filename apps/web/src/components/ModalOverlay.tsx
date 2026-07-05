'use client';
import { useEffect } from 'react';
import Portal from './Portal';

interface Props {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

/**
 * Global modal overlay rendered via portal to document.body.
 * Covers the full viewport, blocks background scroll, closes on Escape.
 */
export default function ModalOverlay({ children, onClose, className }: Props) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <Portal>
      <div
        className={className || "fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"}
        onClick={onClose}
      >
        {children}
      </div>
    </Portal>
  );
}
