'use client';

/** A selectable card: icon, title and subtitle, with a radio dot that fills when active. */
export function ToggleCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ' +
        (active
          ? 'border-lc-green bg-lc-green/10 text-lc-white'
          : 'border-lc-border bg-lc-black hover:border-lc-muted text-lc-white/80')
      }
    >
      <div className="text-xl leading-none">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-lc-muted">{subtitle}</div>
      </div>
      <div
        className={
          'mt-0.5 h-4 w-4 shrink-0 rounded-full border ' +
          (active ? 'border-lc-green bg-lc-green' : 'border-lc-border')
        }
      />
    </button>
  );
}
