'use client';

/** One number on the table's left rail: sent, lines, level, combo. */
export default function StackerStat({ label, value, accent, testId }: { label: string; value: number | string; accent?: string; testId?: string }) {
  return (
    <div className="rounded-lg border border-lc-border bg-lc-black/40 px-2 py-1 text-center">
      <div className="text-[9px] uppercase tracking-[0.12em] text-lc-muted">{label}</div>
      <div className="text-sm font-bold" style={{ color: accent ?? '#fafafa' }} data-testid={testId}>
        {value}
      </div>
    </div>
  );
}
