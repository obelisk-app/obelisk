import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils/style/cn';

/**
 * The icon-only button, round by default: the composer's mic, emoji and
 * attach controls, the dark circles over photos and video, the call
 * accept and decline buttons, the bordered sheet close.
 *
 * Tones, each the dominant hand-rolled recipe of its kind:
 *   ghost       muted icon, faint white fill on hover (composer controls);
 *               green while pressed or expanded (a toggle or open menu)
 *   danger      muted icon that turns red on hover (discard a recording)
 *   dangerSoft  a soft red disc (stop recording)
 *   dangerSolid a solid red disc (decline a call)
 *   primary     a solid green disc (send, accept a call)
 *   outline     the bordered, faintly filled secondary (sheet close, the ⋯ beside a name)
 *   accent      the same surface in green: an open menu trigger, a zap
 *   overlay     a dark translucent disc that reads over any photo or video
 */
export type IconButtonTone = 'ghost' | 'danger' | 'dangerSoft' | 'dangerSolid' | 'primary' | 'outline' | 'accent' | 'overlay';
/** The footprint in Tailwind units, so `size="9"` is `h-9 w-9` (36px). */
export type IconButtonSize = '5' | '7' | '8' | '9' | '10' | '11' | '14';
export type IconButtonShape = 'round' | 'square';

const TONE_CLASS: Record<IconButtonTone, string> = {
  ghost: 'text-lc-muted hover:bg-white/5 hover:text-lc-white aria-pressed:text-lc-green aria-pressed:hover:text-lc-green aria-expanded:text-lc-green aria-expanded:hover:text-lc-green',
  danger: 'text-lc-muted hover:bg-red-500/10 hover:text-red-400',
  dangerSoft: 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
  dangerSolid: 'bg-red-500 text-white hover:bg-red-600',
  primary: 'bg-lc-green text-lc-black hover:brightness-110',
  outline: 'border border-lc-border bg-lc-card/60 text-lc-white hover:border-lc-green/50 hover:bg-lc-green/10',
  accent: 'border border-lc-green/50 bg-lc-green/10 text-lc-green hover:bg-lc-green/20',
  overlay: 'bg-black/60 text-white backdrop-blur-sm hover:bg-black/80',
};

const SIZE_CLASS: Record<IconButtonSize, string> = {
  '5': 'h-5 w-5',
  '7': 'h-7 w-7',
  '8': 'h-8 w-8',
  '9': 'h-9 w-9',
  '10': 'h-10 w-10',
  '11': 'h-11 w-11',
  '14': 'h-14 w-14',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon has no text, so this is the button's only name. */
  'aria-label': string;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  shape?: IconButtonShape;
}

/** Defaults to `type="button"`, has the shared focus ring and the dimmed disabled state. */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tone = 'ghost', size = '9', shape = 'round', type = 'button', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60 disabled:cursor-not-allowed disabled:opacity-40',
        shape === 'round' ? 'rounded-full' : 'rounded-lg',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export default IconButton;
