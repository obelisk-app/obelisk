import type { ReactNode } from 'react';

type Variant = 'info' | 'warn' | 'note';

const STYLES: Record<Variant, { bg: string; border: string; icon: string; label: string }> = {
  info: {
    bg: 'bg-[rgba(180,249,83,0.06)]',
    border: 'border-lc-green/40',
    icon: '◈',
    label: 'Info',
  },
  warn: {
    bg: 'bg-[rgba(245,158,11,0.06)]',
    border: 'border-amber-500/40',
    icon: '△',
    label: 'Heads up',
  },
  note: {
    bg: 'bg-[rgba(163,163,163,0.06)]',
    border: 'border-lc-border',
    icon: '·',
    label: 'Note',
  },
};

export default function Callout({
  type = 'info',
  title,
  children,
}: {
  type?: Variant;
  title?: string;
  children: ReactNode;
}) {
  const style = STYLES[type];
  return (
    <aside
      data-testid={`callout-${type}`}
      className={`my-6 rounded-xl border px-5 py-4 ${style.bg} ${style.border}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="text-lc-green text-lg font-bold leading-none mt-0.5"
          aria-hidden="true"
        >
          {style.icon}
        </span>
        <div className="flex-1">
          {(title || type !== 'note') && (
            <div className="text-xs font-bold uppercase tracking-wider text-lc-green mb-1">
              {title || style.label}
            </div>
          )}
          <div className="text-sm text-lc-white/90 leading-relaxed">{children}</div>
        </div>
      </div>
    </aside>
  );
}
