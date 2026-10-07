/**
 * Menu building blocks: one look for every popover menu in the app.
 *
 * Panel: rounded-lg, `lc-dark` fill, `lc-border`, inner padding so each row
 * hovers as its own rounded pill. Rows: icon + label (+ optional hint line),
 * `text-sm`, `lc-white` on hover-tinted green. The channel right-click menu
 * set the pattern; the profile ⋯ menu follows it.
 *
 * Contrast rule (CLAUDE.md, "Design System"): row labels are `lc-white`, not
 * `lc-muted`: a muted label reads as disabled. Only the optional hint line
 * and genuinely disabled rows are muted.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { menuRowClass } from '@/utils/style/menu-row-class';

export const MENU_PANEL_CLASS = 'rounded-lg border border-lc-border bg-lc-dark p-1.5 shadow-2xl';

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
  role = 'menuitem',
  buttonProps,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
  /** `menuitemcheckbox` for an on/off row; pass its `aria-checked` in `buttonProps`. */
  role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox';
  /** ARIA state for submenu triggers, radio and checkbox rows (`aria-expanded`, `aria-checked`, …) and `data-*` hooks. */
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'className' | 'disabled' | 'type' | 'role'>
    & { [dataAttribute: `data-${string}`]: string | boolean | undefined };
}) {
  return (
    <button {...buttonProps} type="button" role={role} className={menuRowClass(danger)} onClick={onClick} disabled={disabled} data-testid={testId}>
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
  newTab = true,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  href: string;
  testId?: string;
  /** Default true (an outside page). False for a link into the app itself. */
  newTab?: boolean;
}) {
  const external = newTab ? { target: '_blank', rel: 'noreferrer noopener' } : {};
  return (
    <a role="menuitem" href={href} {...external} className={menuRowClass()} data-testid={testId}>
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
