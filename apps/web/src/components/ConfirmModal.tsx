'use client'

import { useEffect } from 'react'

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

const TONE_BUTTON: Record<NonNullable<ConfirmModalProps['tone']>, string> = {
  default: 'bg-azure',
  danger: 'bg-red-500',
  warning: 'bg-caution',
}

const TONE_ICON: Record<NonNullable<ConfirmModalProps['tone']>, string> = {
  default: 'bg-azure/10 text-azure',
  danger: 'bg-red-50 text-red-600',
  warning: 'bg-caution/10 text-caution',
}

/**
 * Accessible confirmation modal used for safe (bulk) actions.
 * Replaces native window.confirm / alert across the dashboard.
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={() => !loading && onCancel()}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-card p-7 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${TONE_ICON[tone]}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-ink tracking-tight">{title}</h2>
        </div>
        {description && <div className="text-sm text-graphite mb-2">{description}</div>}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`${TONE_BUTTON[tone]} text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity disabled:opacity-50`}
          >
            {loading ? 'Procesando...' : confirmLabel}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-sm text-graphite px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
