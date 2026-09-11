export function HighlightedText({ text, highlights }: { text: string; highlights: Array<{ text: string; reason?: string }> }) {
  if (!highlights || highlights.length === 0 || !text) return <>{text}</>;

  const validHighlights = highlights
    .filter((h) => h.text && text.includes(h.text))
    .map((h) => ({ text: h.text, index: text.indexOf(h.text) }))
    .sort((a, b) => a.index - b.index);

  const nonOverlapping: Array<{ text: string; index: number }> = [];
  let lastEnd = 0;
  for (const h of validHighlights) {
    if (h.index >= lastEnd) { nonOverlapping.push(h); lastEnd = h.index + h.text.length; }
  }

  if (nonOverlapping.length === 0) return <>{text}</>;

  const parts: Array<{ content: string; highlighted: boolean }> = [];
  let cursor = 0;
  for (const h of nonOverlapping) {
    if (h.index > cursor) parts.push({ content: text.slice(cursor, h.index), highlighted: false });
    parts.push({ content: h.text, highlighted: true });
    cursor = h.index + h.text.length;
  }
  if (cursor < text.length) parts.push({ content: text.slice(cursor), highlighted: false });

  return (
    <>
      {parts.map((part, i) =>
        part.highlighted
          ? <mark key={i} className="bg-gpt-mark text-gpt-mark-ink rounded-sm px-0.5">{part.content}</mark>
          : <span key={i}>{part.content}</span>
      )}
    </>
  );
}
