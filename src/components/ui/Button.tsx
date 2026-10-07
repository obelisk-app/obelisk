import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/style/cn';
import Spinner from './Spinner';

/**
 * `pill` / `pillSecondary` are the stylesheet's `lc-pill-primary` /
 * `lc-pill-secondary` (games, social, settings, marketing). `primary` is the
 * rounded-lg green of desktop modal footers. Both primaries are deliberate.
 *
 * `outline` / `outlinePill` are the design rules' secondary action: a border
 * and a faint fill so it reads as clickable, brightening green on hover. The
 * same rounded-lg vs pill split as the primaries: `outline` sits in forms and
 * list rows, `outlinePill` beside pills and in dialogs.
 *
 * `pillDanger` is the soft red pill of a destructive bulk action (kick):
 * the stylesheet pill's shape and padding with a faint red fill, quieter
 * than the solid `danger` a confirmation dialog uses.
 *
 * `zap` is the yellow pill of a Lightning payment (send a zap): zaps are
 * yellow everywhere in the app. It sets its own size, like the tool buttons.
 *
 * `tool` / `toolIcon` are the stylesheet's `lc-tool` (the 28px composer
 * toolbar buttons, which show `aria-pressed`) and `lc-icon-btn` (the 36px
 * round feed toolbar button, 40px on phones). Like the pills they live
 * outside Tailwind's layers, so they set their own size and `size` does not
 * apply to them.
 */
export type ButtonVariant =
  | 'primary' | 'secondary' | 'ghost' | 'danger' | 'pill' | 'pillSecondary' | 'outline' | 'outlinePill'
  | 'pillDanger' | 'tool' | 'toolIcon' | 'zap';
/**
 * `icon` is the square `p-1` footprint of the list-row icon buttons.
 * `icon-md` (`p-2`) and `icon-touch` (`p-2.5`, `p-1.5` from `md` up) are the
 * larger toolbar touch targets; they are sizes, not drift.
 */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-md' | 'icon-touch';
/**
 * `danger` on ghost is the muted icon that turns red on hover (trash, remove).
 * On the outline variants it is the small red-outlined destructive action
 * (revoke, delete a row). `accent` on the outline variants is the green
 * outline of an accent secondary action (upload, grant, an open toggle);
 * ghost treats it as `default`. The other variants ignore tone.
 */
export type ButtonTone = 'default' | 'danger' | 'accent';

/**
 * Resting looks are taken verbatim from the dominant hand-rolled string of
 * each kind, so a migrated call site renders the same pixels:
 *   primary   rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50
 *   secondary rounded-md border border-lc-border px-3 py-1.5 text-sm text-lc-white hover:bg-lc-border/40 (size sm)
 *   ghost     rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white
 *   danger    rounded-full bg-red-600 text-white hover:bg-red-500 (ConfirmDialog)
 *   outline   rounded-lg border border-lc-border bg-lc-card/60 text-lc-white (ICON_BUTTON_CLASS's surface)
 * Every variant gets the same keyboard focus ring; the hand-rolled copies had
 * one in 10 places and none in the rest.
 */
const VARIANT_CLASS: Record<Exclude<ButtonVariant, 'ghost' | 'outline' | 'outlinePill'>, string> = {
  primary: 'rounded-lg bg-lc-green font-semibold text-lc-black hover:brightness-110 focus-visible:ring-lc-green/60',
  secondary: 'rounded-md border border-lc-border text-lc-white hover:bg-lc-border/40 focus-visible:ring-lc-green/60',
  danger: 'rounded-full bg-red-600 font-semibold text-white hover:bg-red-500 focus-visible:ring-red-400/70',
  pill: 'lc-pill-primary focus-visible:ring-lc-green/60',
  pillSecondary: 'lc-pill-secondary focus-visible:ring-lc-green/60',
  pillDanger: 'lc-pill bg-red-500/20 text-red-300 hover:bg-red-500/30 focus-visible:ring-red-400/70',
  tool: 'lc-tool focus-visible:ring-lc-green/60',
  toolIcon: 'lc-icon-btn focus-visible:ring-lc-green/60',
  zap: 'rounded-full bg-yellow-400 px-4 py-1.5 text-xs font-semibold text-lc-black hover:bg-yellow-300 focus-visible:ring-yellow-300/70',
};

const GHOST_TONE_CLASS: Record<ButtonTone, string> = {
  default: 'rounded text-lc-muted hover:bg-lc-card hover:text-lc-white focus-visible:ring-lc-green/60',
  danger: 'rounded text-lc-muted hover:bg-red-500/10 hover:text-red-400 focus-visible:ring-red-400/70',
  accent: 'rounded text-lc-muted hover:bg-lc-card hover:text-lc-white focus-visible:ring-lc-green/60',
};

const OUTLINE_TONE_CLASS: Record<ButtonTone, string> = {
  default: 'border border-lc-border bg-lc-card/60 font-medium text-lc-white hover:border-lc-green/50 hover:bg-lc-green/10 focus-visible:ring-lc-green/60',
  danger: 'border border-red-500/30 font-medium text-red-300 hover:border-red-500/50 hover:bg-red-500/10 focus-visible:ring-red-400/70',
  // An open disclosure or a pressed toggle shows the hover fill and a solid border.
  accent: 'border border-lc-green/50 bg-lc-green/10 font-medium text-lc-green hover:border-lc-green hover:bg-lc-green/20 aria-expanded:border-lc-green aria-expanded:bg-lc-green/20 aria-pressed:border-lc-green aria-pressed:bg-lc-green/20 focus-visible:ring-lc-green/60',
};

function variantClass(variant: ButtonVariant, tone: ButtonTone): string {
  if (variant === 'ghost') return GHOST_TONE_CLASS[tone];
  if (variant === 'outline') return `rounded-lg ${OUTLINE_TONE_CLASS[tone]}`;
  if (variant === 'outlinePill') return `rounded-full ${OUTLINE_TONE_CLASS[tone]}`;
  return VARIANT_CLASS[variant];
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
  icon: 'p-1',
  'icon-md': 'p-2',
  'icon-touch': 'p-2.5 md:p-1.5',
};

/**
 * Pills set type size only. `.lc-pill-*` in globals.css sits outside
 * Tailwind's layers, so its `padding: 10px 24px` beats every padding utility:
 * the `px-4 py-1.5` written at 60 pill call sites never rendered. A pill
 * size that set padding would therefore *change* those buttons.
 *   xs  text-xs (the majority)   sm  text-sm   md  the stylesheet's own   lg  text-base (hero)
 */
const PILL_SIZE_CLASS: Record<ButtonSize, string | undefined> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: undefined,
  lg: 'text-base',
  icon: undefined,
  'icon-md': undefined,
  'icon-touch': undefined,
};

function isPill(variant: ButtonVariant): boolean {
  return variant === 'pill' || variant === 'pillSecondary' || variant === 'pillDanger';
}

/** Variants that set their own size (the stylesheet's tool buttons, the zap pill): no size class at all. */
function isStylesheetSized(variant: ButtonVariant): boolean {
  return variant === 'tool' || variant === 'toolIcon' || variant === 'zap';
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  /** Shows a spinner, sets `aria-busy` and disables the button. */
  loading?: boolean;
  children?: ReactNode;
}

/** The class string for a Button look, for the rare element that must stay an `<a>`. */
export function buttonClass({ variant = 'primary', size = 'md', tone = 'default' }: Pick<ButtonProps, 'variant' | 'size' | 'tone'>): string {
  return cn(
    'inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
    variantClass(variant, tone),
    isStylesheetSized(variant) ? undefined : isPill(variant) ? PILL_SIZE_CLASS[size] : SIZE_CLASS[size],
  );
}

/**
 * A real `<button>` that defaults to `type="button"`: 160 hand-rolled ones
 * had no `type`, which makes them submit buttons inside any `<form>`.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', tone = 'default', loading = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass({ variant, size, tone }), className)}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
});

export default Button;
