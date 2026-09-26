/**
 * Menu building blocks — one look for every popover menu in the app.
 *
 * Panel: rounded-lg, `lc-dark` fill, `lc-border`, inner padding so each row
 * hovers as its own rounded pill. Rows: icon + label (+ optional hint line),
 * `text-sm`, `lc-white` on hover-tinted green. The channel right-click menu
 * set the pattern; the profile ⋯ menu follows it.
 *
 * Contrast rule (CLAUDE.md, "Design System"): row labels are `lc-white`, not
 * `lc-muted` — a muted label reads as disabled. Only the optional hint line
 * and genuinely disabled rows are muted.
 */
import type { ReactNode } from 'react';

export const MENU_PANEL_CLASS = 'rounded-lg border border-lc-border bg-lc-dark p-1.5 shadow-2xl';

const ROW = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent';

function rowClass(danger?: boolean): string {
  return `${ROW} ${danger ? 'text-red-400 hover:bg-red-500/15' : 'text-lc-white hover:bg-lc-green/15'}`;
}

function Body({ icon, label, hint, trailing }: { icon?: ReactNode; label: ReactNode; hint?: ReactNode; trailing?: ReactNode }) {
  return (
    <>
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-80">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {hint && <span className="truncate text-[11px] text-lc-muted">{hint}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center text-lc-muted">{trailing}</span>}
    </>
  );
}

export function MenuItem({
  icon,
  label,
  hint,
  onClick,
  danger,
  disabled,
  testId,
  trailing,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button type="button" role="menuitem" className={rowClass(danger)} onClick={onClick} disabled={disabled} data-testid={testId}>
      <Body icon={icon} label={label} hint={hint} trailing={trailing} />
    </button>
  );
}

export function MenuLink({
  icon,
  label,
  hint,
  href,
  testId,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  href: string;
  testId?: string;
}) {
  return (
    <a role="menuitem" href={href} target="_blank" rel="noreferrer noopener" className={rowClass()} data-testid={testId}>
      <Body icon={icon} label={label} hint={hint} />
    </a>
  );
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-lc-border" aria-hidden="true" />;
}

/**
 * Square icon button for a ⋯ / ⚡ style action next to a name. Same
 * footprint and border as its siblings so a row of them reads as one set.
 */
export const ICON_BUTTON_CLASS = 'flex shrink-0 items-center justify-center rounded-lg border border-lc-border bg-lc-card/60 text-lc-white transition-colors hover:border-lc-green/50 hover:bg-lc-green/10 active:scale-95';
