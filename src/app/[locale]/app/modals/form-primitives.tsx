'use client';


export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="shrink-0 text-sm font-bold text-lc-white">{title}</h3>
      {hint && <span className="break-words text-right text-[11px] text-lc-muted">{hint}</span>}
    </div>
  );
}

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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-medium text-lc-muted">{label}</div>
      {children}
    </label>
  );
}

// -- DMs ----------------------------------------------------------------
