'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface SearchableSelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SearchableSelectOption[]
  /** Text shown when nothing is selected (and as the first clearable entry if `clearable`). */
  placeholder?: string
  /** When provided, shows a selectable entry that clears the value (e.g. "Sin acompañante"). */
  emptyOptionLabel?: string
  /** Placeholder for the search input. */
  searchPlaceholder?: string
  disabled?: boolean
  required?: boolean
  id?: string
}

/** Normalize for accent/case-insensitive search (José -> jose). */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar',
  emptyOptionLabel,
  searchPlaceholder = 'Buscar...',
  disabled = false,
  required = false,
  id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = options.find((o) => o.value === value) || null

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return options
    return options.filter((o) => normalize(o.label).includes(q))
  }, [options, query])

  // Entries shown in the list, including the optional "empty/clear" entry.
  const entries: SearchableSelectOption[] = useMemo(() => {
    if (emptyOptionLabel != null && !normalize(query.trim())) {
      return [{ value: '', label: emptyOptionLabel }, ...filtered]
    }
    return filtered
  }, [emptyOptionLabel, filtered, query])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  // Focus the search input and reset state when opening.
  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      const t = setTimeout(() => searchRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Keep highlighted item in view.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  function pick(option: SearchableSelectOption) {
    onChange(option.value)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, entries.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = entries[highlight]
      if (opt) pick(opt)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const hasValue = selected != null && value !== ''

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 border border-silver-mist rounded-xl text-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-azure/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={hasValue ? 'text-ink truncate' : 'text-graphite truncate'}>
          {hasValue ? selected!.label : placeholder}
        </span>
        <svg className="w-4 h-4 text-graphite shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Hidden input so the field participates in native form validation. */}
      {/* (Validation is handled in JS by the parent form to keep the combobox focusable.) */}

      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-white border border-silver-mist rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-silver-mist">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-graphite pointer-events-none"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="M14 14l3.5 3.5" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setHighlight(0)
                }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 border border-silver-mist rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
              />
            </div>
          </div>

          <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {entries.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-graphite">Sin resultados</li>
            )}
            {entries.map((opt, index) => {
              const isSelected = opt.value === value
              const isHighlighted = index === highlight
              return (
                <li
                  key={opt.value || '__empty__'}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(opt)}
                  className={`px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-2 ${
                    isHighlighted ? 'bg-azure/10' : ''
                  } ${isSelected ? 'text-azure font-medium' : opt.value === '' ? 'text-graphite' : 'text-ink'}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M5 10l3.5 3.5L15 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default SearchableSelect
