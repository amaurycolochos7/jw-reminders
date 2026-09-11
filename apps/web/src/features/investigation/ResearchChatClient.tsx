'use client';
import { useResearchChat } from './hooks/useResearchChat';
import { isDesktopViewport } from './utils/helpers';
import {
  SidebarIcon,
  SearchIcon,
  PlusIcon,
  EmptyState,
  UserBubble,
  LoadingIndicator,
  AssistantCard,
  SidebarPanelContents,
} from './components/index';

export function ResearchChatClient() {
  const {
    sessions,
    profiles,
    currentProfile,
    currentSessionId,
    messages,
    input,
    loadingStep,
    error,
    sidebarOpen,
    sidebarCollapsed,
    searchOpen,
    searchQuery,
    optionsOpen,
    outputType,
    level,
    duration,
    messagesEndRef,
    textareaRef,
    searchInputRef,
    setInput,
    setSidebarOpen,
    setSidebarCollapsed,
    setSearchOpen,
    setSearchQuery,
    setOptionsOpen,
    setOutputType,
    setLevel,
    setDuration,
    setError,
    loadSession,
    startNewChat,
    deleteSessionData,
    sendMessage,
    handleQuickAction,
    handleKeyDown,
    variantLoadingKey,
    handleGenerateMoreVariants,
  } = useResearchChat();

  function toggleSearch() {
    setSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        if (isDesktopViewport()) setSidebarCollapsed(false);
        else setSidebarOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      return next;
    });
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSessions = normalizedQuery
    ? sessions.filter((s) => (s.title || 'sin título').toLowerCase().includes(normalizedQuery))
    : sessions;

  const isEmpty = messages.length === 0 && loadingStep === 'idle';

  return (
    <div
      data-profile={currentProfile?.themeKey ?? 'general'}
      className="flex h-dvh -mx-4 sm:-mx-6 lg:-mx-8 mt-[-72px] mb-[-24px] lg:mt-[-32px] lg:mb-[-32px] font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]"
    >
      {/* Desktop sidebar (collapsible to a slim icon rail, ChatGPT-style) */}
      <aside
        className={`hidden lg:flex lg:flex-col shrink-0 border-r border-gpt-hairline bg-gpt-sidebar overflow-hidden transition-[width] duration-200 ease-in-out ${
          sidebarCollapsed ? 'w-[52px]' : 'w-[260px]'
        }`}
      >
        {sidebarCollapsed ? (
          <div className="w-[52px] flex flex-col items-center gap-1 py-3">
            <button
              onClick={() => setSidebarCollapsed(false)}
              title="Mostrar barra lateral"
              aria-label="Mostrar barra lateral"
              className="p-2 rounded-lg text-gpt-ash hover:bg-gpt-hover hover:text-gpt-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
            >
              <SidebarIcon className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => {
                setSidebarCollapsed(false);
                setSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }}
              title="Buscar conversaciones"
              aria-label="Buscar conversaciones"
              className="p-2 rounded-lg text-gpt-ash hover:bg-gpt-hover hover:text-gpt-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
            >
              <SearchIcon className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => setSidebarCollapsed(false)}
              title="Nuevo chat"
              aria-label="Nuevo chat"
              className="p-2 rounded-lg text-gpt-ash hover:bg-gpt-hover hover:text-gpt-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20"
            >
              <PlusIcon className="w-[18px] h-[18px]" />
            </button>
          </div>
        ) : (
          <div className="w-[260px] flex flex-col h-full">
            <SidebarPanelContents
              sessions={filteredSessions}
              totalCount={sessions.length}
              currentSessionId={currentSessionId}
              profiles={profiles}
              searchOpen={searchOpen}
              searchQuery={searchQuery}
              searchInputRef={searchInputRef}
              onSearchChange={setSearchQuery}
              onNewChat={startNewChat}
              onSelect={loadSession}
              onDelete={deleteSessionData}
              onToggleCollapse={() => setSidebarCollapsed(true)}
              onToggleSearch={toggleSearch}
            />
          </div>
        )}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-gpt-scrim" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-gpt-sidebar flex flex-col shadow-elevated">
            <div className="h-14 px-3 border-b border-gpt-hairline flex items-center justify-between shrink-0">
              <span className="font-semibold text-[14px] text-gpt-ink">Historial</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleSearch}
                  title="Buscar conversaciones"
                  aria-label="Buscar conversaciones"
                  aria-pressed={searchOpen}
                  className={`p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 ${
                    searchOpen ? 'bg-gpt-hover text-gpt-ink' : 'text-gpt-ash hover:bg-gpt-hover hover:text-gpt-ink'
                  }`}
                >
                  <SearchIcon className="w-[18px] h-[18px]" />
                </button>
                <button
                  onClick={() => setSidebarOpen(false)}
                  title="Cerrar barra lateral"
                  aria-label="Cerrar barra lateral"
                  className="p-1.5 rounded-lg text-gpt-ash hover:bg-gpt-hover hover:text-gpt-ink active:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 transition-colors"
                >
                  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <SidebarPanelContents
              sessions={filteredSessions}
              totalCount={sessions.length}
              currentSessionId={currentSessionId}
              profiles={profiles}
              searchOpen={searchOpen}
              searchQuery={searchQuery}
              searchInputRef={undefined}
              onSearchChange={setSearchQuery}
              onNewChat={startNewChat}
              onSelect={loadSession}
              onDelete={deleteSessionData}
            />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gpt-white">
        {/* Header */}
        <header className="flex items-center gap-1 h-14 px-3 sm:px-4 border-b border-gpt-hairline bg-gpt-white shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            title="Mostrar barra lateral"
            aria-label="Mostrar barra lateral"
            className="lg:hidden p-2 rounded-lg text-gpt-ash hover:bg-gpt-hover hover:text-gpt-ink active:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 transition-colors"
          >
            <SidebarIcon className="w-[18px] h-[18px]" />
          </button>
          <h1 className="flex-1 min-w-0 text-[15px] font-semibold text-gpt-ink truncate px-1.5">
            Chat de investigación
            {currentProfile && currentProfile.id !== 'general' && (
              <span className="gpt-mono ml-2 text-[11px] font-medium text-gpt-accent bg-gpt-hover px-2 py-0.5 rounded-pill align-middle">
                {currentProfile.name}
              </span>
            )}
          </h1>
        </header>

        {/* Messages scroll area */}
        <div className="flex-1 overflow-y-auto gpt-scrollbar">
          <div className={`max-w-3xl mx-auto px-4 ${isEmpty ? 'h-full flex items-center justify-center' : 'py-6 space-y-6'}`}>
            {isEmpty ? (
              <EmptyState onExample={(t) => { setInput(t); textareaRef.current?.focus(); }} />
            ) : (
              <>
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === 'user' ? (
                      <UserBubble content={msg.content} />
                    ) : (
                      <AssistantCard
                        response={msg.structured}
                        messageId={msg.id}
                        onQuickAction={handleQuickAction}
                        onGenerateMoreVariants={handleGenerateMoreVariants}
                        variantLoadingKey={variantLoadingKey}
                      />
                    )}
                  </div>
                ))}

                {loadingStep !== 'idle' && loadingStep !== 'done' && <LoadingIndicator step={loadingStep} />}
                {error && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-gpt-hairline bg-gpt-white shrink-0">
          <div className="max-w-3xl mx-auto p-3 sm:p-4">
            {/* Options panel */}
            {optionsOpen && (
              <div className="mb-3 p-3 bg-gpt-sidebar rounded-xl border border-gpt-hairline space-y-2">
                <div className="flex flex-wrap gap-3">
                  <label className="text-[12px] text-gpt-hollow">
                    Tipo
                    <select value={outputType} onChange={(e) => setOutputType(e.target.value)} className="ml-1.5 text-[12px] py-1 px-2 rounded-lg border border-gpt-hairline bg-gpt-white text-gpt-ink">
                      <option value="comments">Comentarios</option>
                      <option value="summary">Resumen</option>
                      <option value="main_ideas">Ideas principales</option>
                      <option value="spiritual_gem">Perla espiritual</option>
                      <option value="simple_explanation">Explicación sencilla</option>
                    </select>
                  </label>
                  <label className="text-[12px] text-gpt-hollow">
                    Profundidad
                    <select value={level} onChange={(e) => setLevel(e.target.value)} className="ml-1.5 text-[12px] py-1 px-2 rounded-lg border border-gpt-hairline bg-gpt-white text-gpt-ink">
                      <option value="auto">Automática</option>
                      <option value="directo">Breve</option>
                      <option value="natural">Normal</option>
                      <option value="profundo">Profunda</option>
                    </select>
                  </label>
                  <label className="text-[12px] text-gpt-hollow">
                    Duración
                    <select value={duration} onChange={(e) => setDuration(e.target.value)} className="ml-1.5 text-[12px] py-1 px-2 rounded-lg border border-gpt-hairline bg-gpt-white text-gpt-ink">
                      <option value="auto">Automática</option>
                      <option value="15">15s</option>
                      <option value="30">30s</option>
                      <option value="60">60s</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
            {/* Input row */}
            <form onSubmit={sendMessage} className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setOptionsOpen(!optionsOpen)}
                title="Opciones de generación"
                aria-label="Opciones de generación"
                aria-pressed={optionsOpen}
                className={`shrink-0 p-2 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/20 ${
                  optionsOpen ? 'border-gpt-edge bg-gpt-hover text-gpt-ink' : 'border-gpt-hairline text-gpt-hollow hover:bg-gpt-hover hover:text-gpt-ink active:bg-black/[0.06]'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/></svg>
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pega una pregunta, texto o referencia…"
                rows={1}
                className="flex-1 resize-none rounded-xl text-sm text-gpt-ink bg-gpt-white border border-gpt-hairline placeholder:text-gpt-hollow focus:outline-none focus:border-gpt-edge focus:ring-2 focus:ring-gpt-ink/10 min-h-[42px] max-h-[160px] px-3.5 py-2.5 leading-[1.4] transition-colors"
                style={{ height: 'auto', overflow: 'hidden' }}
                onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }}
              />
              <button
                type="submit"
                disabled={!input.trim() || loadingStep !== 'idle'}
                title="Enviar mensaje"
                aria-label="Enviar mensaje"
                className="shrink-0 p-2.5 bg-gpt-accent text-gpt-on-accent rounded-xl hover:opacity-85 active:opacity-70 disabled:opacity-20 disabled:cursor-not-allowed transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-accent/30 focus-visible:ring-offset-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"/></svg>
              </button>
            </form>
            <p className="text-[11px] text-gpt-hollow mt-2 text-center">Herramienta no oficial · Verifica siempre en JW.org</p>
          </div>
        </div>
      </div>
    </div>
  );
}
