export function SidebarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3.75" y="4.5" width="16.5" height="15" rx="2" strokeWidth={1.5} />
      <path strokeWidth={1.5} strokeLinecap="round" d="M9.75 4.5v15" />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35m0 0a7.5 7.5 0 10-10.607 0 7.5 7.5 0 0010.607 0z" />
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 7h12M9.75 7V5.25a1.5 1.5 0 011.5-1.5h1.5a1.5 1.5 0 011.5 1.5V7m-8.25 0l.6 12.15A2 2 0 008.09 21h7.82a2 2 0 002-1.85L18.5 7" />
    </svg>
  );
}
