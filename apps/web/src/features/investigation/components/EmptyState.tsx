export function EmptyState({ onExample }: { onExample: (text: string) => void }) {
  const examples = [
    { text: '¿Por qué conocer a Dios no es solo un proceso intelectual? (Juan 17:3; w13 15/10 pág. 27 párr. 7)', hint: 'Razonamiento espiritual' },
    { text: '¿Quién es Jehová? (Sal. 83:18)', hint: 'Definición sencilla' },
    { text: '¿Qué significa meditar y en qué cosas deberíamos meditar?', hint: 'Explicación básica' },
    { text: 'w15 15/12 pág. 8 párrs. 16, 17', hint: 'Referencia directa' },
  ];

  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-10 sm:py-14">
      <div className="w-10 h-10 rounded-full bg-gpt-sidebar flex items-center justify-center mb-4 border border-gpt-hairline">
        <svg className="w-5 h-5 text-gpt-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
      </div>
      <h2 className="text-lg font-semibold text-gpt-ink mb-1.5">Asistente de investigación</h2>
      <p className="text-[13px] text-gpt-ash max-w-sm leading-relaxed mb-7">
        Prepara comentarios basados en la Biblia y publicaciones. Pega una pregunta o referencia para comenzar.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
        {examples.map((ex) => (
          <button
            key={ex.text}
            onClick={() => onExample(ex.text)}
            className="text-left px-3.5 py-3 border border-gpt-hairline rounded-xl text-gpt-ink hover:bg-gpt-hover hover:border-gpt-edge transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gpt-ink/15"
          >
            <span className="block text-[10px] font-medium uppercase tracking-wider text-gpt-hollow mb-1">{ex.hint}</span>
            <span className="block text-[13px] leading-snug line-clamp-2">{ex.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
