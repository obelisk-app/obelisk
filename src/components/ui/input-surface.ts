import { cn } from './cn';

/** Padding, radius and default text size. `sm` and `md` are the original two. */
export type InputSize = 'xs' | 'sm' | 'md' | 'lg';
/** Text size override for a surface whose padding and type size disagree (the mono URL rows). */
export type InputFontSize = 'xs' | 'sm';
/**
 * - `surface`: the bordered black box (default).
 * - `pill`: the same surface fully rounded (forum search).
 * - `ghost`: borderless `bg-lc-black/50` with a focus ring (game seeds, seat names).
 * - `mobile`: the mobile shell's `.setup-input` stylesheet class.
 * - `bare`: no surface at all; the wrapper paints it (search bars, composers).
 */
export type InputVariant = 'surface' | 'pill' | 'ghost' | 'mobile' | 'bare';
/** `dark` sits on a `bg-lc-black` row, where a black box would vanish. */
export type InputTone = 'black' | 'dark';
/** Which ends of the control hold an overlaid slot, so the text pads around it. */
export type InputAdornment = 'prefix' | 'suffix' | 'both';
/** How much room the end slot needs: one icon button, or two side by side (spinner and clear). */
export type InputEndWidth = 'single' | 'double';

interface SizeSpec {
  shape: string;
  /** The unadorned padding, kept as one string so existing class lists stay byte-identical. */
  pad: string;
  left: string;
  right: string;
  start: string;
  end: string;
  endDouble: string;
  y: string;
  text: InputFontSize;
}

const SIZE: Record<InputSize, SizeSpec> = {
  xs: { shape: 'rounded', pad: 'px-2 py-1', left: 'pl-2', right: 'pr-2', start: 'pl-7', end: 'pr-7', endDouble: 'pr-12', y: 'py-1', text: 'xs' },
  sm: { shape: 'rounded', pad: 'px-2 py-1.5', left: 'pl-2', right: 'pr-2', start: 'pl-8', end: 'pr-8', endDouble: 'pr-14', y: 'py-1.5', text: 'sm' },
  md: { shape: 'rounded-lg', pad: 'px-3 py-2', left: 'pl-3', right: 'pr-3', start: 'pl-10', end: 'pr-11', endDouble: 'pr-16', y: 'py-2', text: 'sm' },
  lg: { shape: 'rounded-xl', pad: 'px-3 py-2.5', left: 'pl-3', right: 'pr-3', start: 'pl-10', end: 'pr-11', endDouble: 'pr-16', y: 'py-2.5', text: 'sm' },
};

const TEXT: Record<InputFontSize, string> = { xs: 'text-xs', sm: 'text-sm' };

export interface InputSurfaceOptions {
  size?: InputSize;
  variant?: InputVariant;
  tone?: InputTone;
  fontSize?: InputFontSize;
  invalid?: boolean;
  adorned?: InputAdornment | null;
  endWidth?: InputEndWidth;
}

function padding(spec: SizeSpec, adorned: InputAdornment | null, endWidth: InputEndWidth): string {
  if (adorned === null) return spec.pad;
  const hasStart = adorned === 'prefix' || adorned === 'both';
  const hasEnd = adorned === 'suffix' || adorned === 'both';
  const left = hasStart ? spec.start : spec.left;
  const right = !hasEnd ? spec.right : endWidth === 'double' ? spec.endDouble : spec.end;
  return `${left} ${right} ${spec.y}`;
}

/**
 * The class string for a control on the input surface. Shared with TextArea so
 * the two never drift; `md` is the dominant hand-rolled input (`w-full rounded-lg
 * border border-lc-border bg-lc-black px-3 py-2 text-sm ...`) and `sm` is the
 * `inputClasses` string the desktop modals shared.
 */
export function inputSurfaceClass({
  size = 'md',
  variant = 'surface',
  tone = 'black',
  fontSize,
  invalid = false,
  adorned = null,
  endWidth = 'single',
}: InputSurfaceOptions): string {
  const spec = SIZE[size];
  const pad = padding(spec, adorned, endWidth);
  const text = TEXT[fontSize ?? spec.text];
  switch (variant) {
    case 'bare':
      return '';
    case 'mobile':
      return 'setup-input';
    case 'ghost':
      return cn('w-full rounded bg-lc-black/50', pad, text, 'text-lc-white outline-none focus:ring-1 focus:ring-lc-green disabled:opacity-40');
    default:
      return cn(
        'w-full',
        variant === 'pill' ? 'rounded-full' : spec.shape,
        'border',
        invalid ? 'border-red-500' : 'border-lc-border',
        tone === 'dark' ? 'bg-lc-dark' : 'bg-lc-black',
        pad,
        text,
        'text-lc-white outline-none placeholder:text-lc-muted',
        !invalid && 'focus:border-lc-green',
        'disabled:opacity-60',
      );
  }
}
