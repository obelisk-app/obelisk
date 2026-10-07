'use client';

/** One search filter the empty dropdown offers: its glyph, what it does and an example. */
export function FilterRow({ icon, title, hint, onClick }: { icon: string; title: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-lc-card">
      <span className="mt-0.5 w-6 text-center text-base text-lc-muted">{icon}</span>
      <span className="flex-1 min-w-0">
        <div className="text-sm text-lc-white">{title}</div>
        <div className="text-xs text-lc-muted">{hint}</div>
      </span>
    </button>
  );
}
