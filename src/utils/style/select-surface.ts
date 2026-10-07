import { cn } from '@/utils/style/cn';

/** `2xs` is the inline category picker in a dense row; `md` matches the Input `md` box. */
export type SelectSize = '2xs' | 'xs' | 'sm' | 'md';
/** `dark` sits on a `bg-lc-black` surface, where a black select would vanish. */
export type SelectTone = 'black' | 'dark';
/** `mobile` is the mobile shell's `.appearance-select`; `bare` leaves styling to `className`/`style`. */
export type SelectVariant = 'surface' | 'mobile' | 'bare';

/** Native `<select>` with the input surface; the hand-rolled ones were all `rounded ... bg-lc-black`. */
const SIZE_CLASS: Record<SelectSize, string> = {
  '2xs': 'rounded px-1.5 py-0.5 text-xs',
  xs: 'rounded px-2 py-1.5 text-xs',
  sm: 'rounded px-2 py-1.5 text-sm',
  md: 'rounded-lg px-3 py-2 text-sm',
};

const TONE_CLASS: Record<SelectTone, string> = {
  black: 'bg-lc-black',
  dark: 'bg-lc-dark',
};

/** The Select primitive's surface classes for a size, tone, variant and validity. */
export function selectSurfaceClass(size: SelectSize, tone: SelectTone, variant: SelectVariant, invalid: boolean): string {
  switch (variant) {
    case 'bare':
      return '';
    case 'mobile':
      return 'appearance-select';
    default:
      return cn(
        SIZE_CLASS[size],
        'border',
        invalid ? 'border-red-500' : 'border-lc-border',
        TONE_CLASS[tone],
        'text-lc-white outline-none',
        !invalid && 'focus:border-lc-green',
        'disabled:cursor-not-allowed disabled:opacity-60',
      );
  }
}
