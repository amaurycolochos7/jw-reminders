'use client';
import { useState, useRef, useEffect } from 'react';
import { PlusIcon, CloseIcon, SearchIcon, TrashIcon, SidebarIcon } from './Icons';
import type { Session, ResearchProfile } from '../types/index';

const SWIPE_COMMIT_PX = 88;
const SWIPE_MAX_PX = 160;
const UNDO_MS = 4000;

export function SidebarPanelContents({
  sessions,
  totalCount,
  currentSessionId,
  profiles,
  searchOpen,
  searchQuery,
  searchInputRef,
  onSearchChange,
  onNewChat,
  onSelect,
  onDelete,
  onToggleCollapse,
  onToggleSearch,
}: {
  sessions: Session[];
  totalCount: number;
  currentSessionId: string | null;
  profiles: ResearchProfile[];
  searchOpen: boolean;
  searchQuery: string;
  searchInputRef: React.RefObject<HTMLInputElement> | undefined;
  onSearchChange: (v: string) => void;
  onNewChat: (profileId: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Solo se pasa en el panel de escritorio expandido; controla su propio rail. */
  onToggleCollapse?: () => void;
  onToggleSearch?: () => void;
}) {
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);

  function handleNewChatClick() {
    if (profiles.length <= 1) {
      onNewChat(profiles[0]?.id || 'general');
      return;
    }
    setProfilePickerOpen((v) => !v);
  }

  function handlePickProfile(profileId: string) {
    setProfilePickerOpen(false);
    onNewChat(profileId);
  }

  return (
    <>
      <div className="p-3 border-b border-gpt-hairline space-y-2 shrink-0 relative">
        {onToggleCollapse && (
          <div className="flex items-center justify-between -mt-1 -mx-1 mb-1">
            <button
              onClick={onToggleCollapse}
              title="Ocultar barra lateral"
              aria-label="Ocultar barra lateral"
              className="p-1.5 rounded-lg text-gpt-ash hover:bg-gpt-hover hover:text-gpt-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
            >
              <SidebarIcon className="w-[16px] h-[16px]" />
            </button>
            <button
              onClick={onToggleSearch}
              title="Buscar conversaciones"
              aria-label="Buscar conversaciones"
              aria-pressed={searchOpen}
              className={`p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 ${
                searchOpen ? 'bg-gpt-hover text-gpt-ink' : 'text-gpt-ash hover:bg-gpt-hover hover:text-gpt-ink'
              }`}
            >
              <SearchIcon className="w-[16px] h-[16px]" />
            </button>
          </div>
        )}
        <button
          onClick={handleNewChatClick}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gpt-white text-gpt-ink text-[13px] font-medium rounded-lg border border-gpt-hairline hover:border-gpt-edge hover:bg-gpt-hover active:bg-black/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
        >
          <PlusIcon className="w-[15px] h-[15px]" />
          Nuevo chat
        </button>
        {profilePickerOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 z-10 bg-gpt-white border border-gpt-edge rounded-lg shadow-elevated overflow-hidden">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePickProfile(p.id)}
                className="w-full text-left px-3 py-2 hover:bg-gpt-hover transition-colors"
              >
                <div className="text-[13px] font-medium text-gpt-ink">{p.name}</div>
                {p.description && <div className="text-[11px] text-gpt-hollow mt-0.5">{p.description}</div>}
              </button>
            ))}
          </div>
        )}
        {searchOpen && (
          <div className="relative">
            <SearchIcon className="w-[13px] h-[13px] absolute left-2.5 top-1/2 -translate-y-1/2 text-gpt-hollow pointer-events-none" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar conversaciones…"
              className="w-full pl-8 pr-7 py-1.5 text-[12.5px] rounded-lg border border-gpt-hairline bg-gpt-white text-gpt-ink placeholder:text-gpt-hollow focus:outline-none focus:border-gpt-edge focus:ring-2 focus:ring-gpt-ink/10"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-gpt-hollow hover:text-gpt-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
              >
                <CloseIcon className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto gpt-scrollbar p-2">
        <ConversationList sessions={sessions} currentSessionId={currentSessionId} onSelect={onSelect} onDelete={onDelete} />
        {searchOpen && searchQuery && sessions.length === 0 && totalCount > 0 && (
          <p className="text-center text-gpt-hollow text-xs py-6 px-2">Sin resultados para "{searchQuery}"</p>
        )}
        {totalCount === 0 && <p className="text-center text-gpt-hollow text-xs py-8 px-2">No hay chats aún</p>}
      </div>
    </>
  );
}

export function ConversationList({
  sessions,
  currentSessionId,
  onSelect,
  onDelete,
}: {
  sessions: Session[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {sessions.map((s) => (
        <SwipeableConversationItem
          key={s.id}
          session={s}
          active={currentSessionId === s.id}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

type SwipePhase = 'idle' | 'removing' | 'undo' | 'collapsing';

function SwipeableConversationItem({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: Session;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<SwipePhase>('idle');
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function handlePointerDown(e: React.PointerEvent) {
    if (phase !== 'idle') return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    // Cualquier movimiento (horizontal o vertical) cuenta como "no fue un tap",
    // para no disparar onSelect al final de un scroll vertical que empezó en esta fila.
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) return; // deja hacer scroll vertical, sin arrastrar la fila
    setDragX(Math.min(0, Math.max(dx, -SWIPE_MAX_PX)));
  }

  function handlePointerUp() {
    if (!dragStart.current) return;
    dragStart.current = null;
    setDragging(false);

    if (!moved.current) {
      onSelect(session.id);
      setDragX(0);
      return;
    }

    if (dragX <= -SWIPE_COMMIT_PX) {
      commitDelete();
    } else {
      setDragX(0);
    }
  }

  function commitDelete() {
    setPhase('removing');
    setDragX(-SWIPE_MAX_PX * 2.2);
    timer.current = setTimeout(() => {
      setPhase('undo');
      timer.current = setTimeout(() => {
        setPhase('collapsing');
        timer.current = setTimeout(() => onDelete(session.id), 220);
      }, UNDO_MS);
    }, 220);
  }

  function handleUndo() {
    if (timer.current) clearTimeout(timer.current);
    setPhase('idle');
    setDragX(0);
  }

  const msgCount = session._count ? Math.ceil(session._count.messages / 2) : 0;
  const pastThreshold = dragX <= -SWIPE_COMMIT_PX;

  if (phase === 'undo' || phase === 'collapsing') {
    return (
      <div className={`overflow-hidden transition-all duration-200 ease-in ${phase === 'collapsing' ? 'max-h-0 opacity-0' : 'max-h-14 opacity-100'}`}>
        <div className="flex items-center justify-between pl-3.5 pr-2.5 py-2.5 text-[13px] text-gpt-hollow">
          <span>Conversación eliminada</span>
          <button onClick={handleUndo} className="text-gpt-accent font-medium px-2 py-1 -mr-2 rounded-lg hover:bg-gpt-hover transition-colors">
            Deshacer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        className="absolute inset-0 flex items-center justify-end pr-5 bg-red-600 transition-transform"
        style={{ transform: `scale(${pastThreshold ? 1 : 0.92})`, opacity: dragX < -12 ? 1 : 0 }}
      >
        <TrashIcon className={`w-[18px] h-[18px] text-white transition-transform ${pastThreshold ? 'scale-110' : 'scale-100'}`} />
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? 'none' : 'transform 220ms ease' }}
        className={`relative w-full text-left pl-3.5 pr-2.5 py-2 rounded-lg text-sm select-none touch-pan-y cursor-pointer bg-gpt-sidebar ${
          active ? 'bg-gpt-hover text-gpt-ink' : 'text-gpt-ash hover:bg-gpt-hover hover:text-gpt-ink'
        }`}
      >
        {active && <span className="absolute left-1 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gpt-accent" />}
        <div className={`truncate text-[13px] leading-tight ${active ? 'font-medium' : ''}`}>{session.title || 'Sin título'}</div>
        <div className="text-[11px] text-gpt-hollow mt-0.5 flex items-center gap-1">
          <span>{new Date(session.updatedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</span>
          {msgCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{msgCount} mensaje{msgCount === 1 ? '' : 's'}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
