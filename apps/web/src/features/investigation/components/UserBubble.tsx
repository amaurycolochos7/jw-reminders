export function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[75%] bg-gpt-sidebar text-gpt-ink px-4 py-2.5 rounded-2xl rounded-br-md text-[14px] whitespace-pre-wrap leading-relaxed">
        {content}
      </div>
    </div>
  );
}
