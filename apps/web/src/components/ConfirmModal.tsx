'use client'

import { useEffect } from 'react'
import Portal from './Portal'

export interface ConfirmModalProps {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Visual tone for the confirm button. */
  tone?: 'default' | 'danger' | 'warning'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation modal — DESIGN.md "Family" style.
 *
 * Surfaces: cream canvas bg, inset hairline border (stone-surface), no heavy shadows.
 * Typography: Inter weight hierarchy. Heading charcoal for title, body brown for desc.
 * Buttons: ink-black filled pill for primary action (danger overrides to alert-red),
 *          ghost text for cancel (no border, no bg — just charcoal text).
 * Shape: 10px card radius per DESIGN.md spec.
 */
export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, loading, onCancel])

  if (!open) return null

  // Tone-specific confirm button color
  const confirmBg =
    tone === 'danger' ? 'bg-[#ff2b3a]' :
    tone === 'warning' ? 'bg-[#d48f00]' :
    'bg-[#121212]'

  // Tone-specific icon accent
  const iconColor =
    tone === 'danger' ? 'text-[#ff2b3a]' :
    tone === 'warning' ? 'text-[#d48f00]' :
    'text-[#121212]'

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
      >
        {/* Backdrop — subtle, no heavy blur */}
        <div
          className="absolute inset-0 bg-[#121212]/20"
          onClick={() => !loading && onCancel()}
        />

        {/* Card — inset hairline border, cream canvas, 10px radius */}
        <div
          className="relative w-full max-w-[380px] bg-[#fbfaf9] rounded-[10px] p-8 shadow-[0_0_24px_0_rgba(0,0,0,0.15)]"
          style={{ boxShadow: 'inset 0 0 0 1px #f2f0ed, 0 0 24px 0 rgba(0,0,0,0.12)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon */}
          <div className={`w-11 h-11 rounded-full bg-[#f2f0ed] flex items-center justify-center mb-5 ${iconColor}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          {/* Title — heading charcoal, Inter 500 */}
          <h2 className="text-[19px] font-medium text-[#343433] leading-[27px] tracking-[-0.3px]">
            {title}
          </h2>

          {/* Description — body brown, Inter 400 */}
          {description && (
            <p className="mt-3 text-[15px] leading-[22px] tracking-[-0.14px] text-[#474645]">
              {description}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-7">
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`${confirmBg} text-white text-[14px] font-semibold px-5 py-2.5 rounded-[32px] hover:opacity-90 transition-opacity disabled:opacity-50 tracking-[-0.009em]`}
            >
              {loading ? 'Procesando...' : confirmLabel}
            </button>
            <button
              onClick={onCancel}
              disabled={loading}
              className="text-[14px] font-medium text-[#474645] px-4 py-2.5 rounded-[32px] hover:bg-[#f2f0ed] transition-colors disabled:opacity-50 tracking-[-0.009em]"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
