import type { CSSProperties, LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

/**
 * Pick the variant by where the control sits:
 *
 *   field      the label over a desktop control (`Field` renders this one)
 *   caps       the small-caps label over a settings or upload control
 *   sheet      the label over a control in a phone sheet
 *   sheetMono  the same in the monospace face (relay and branding sheets)
 *
 * The phone shell's labels are written as inline styles, as the rest of its
 * sheet bodies are, so a sheet's own stylesheet rules (`.setup-field label`)
 * keep losing to them exactly as before. With no variant the label adds no
 * classes: a label that wraps its control (a toggle row, a file picker pill)
 * passes its own layout.
 */
export type LabelVariant = 'field' | 'caps' | 'sheet' | 'sheetMono';

const VARIANT_CLASS: Partial<Record<LabelVariant, string>> = {
  field: 'text-[11px] font-medium text-lc-muted',
  caps: 'text-xs uppercase tracking-wider text-lc-muted',
};

const SHEET: CSSProperties = {
  fontSize: 10,
  color: 'var(--app-text-dim)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
};

const VARIANT_STYLE: Partial<Record<LabelVariant, CSSProperties>> = {
  sheet: SHEET,
  sheetMono: { ...SHEET, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" },
};

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  variant?: LabelVariant;
  children?: ReactNode;
}

/** Every form label outside the ui kit; a label for a control is a real `<label for>`. */
export default function Label({ variant, className, style, children, ...rest }: LabelProps) {
  const base = variant && VARIANT_STYLE[variant];
  return (
    <label
      className={cn(variant && VARIANT_CLASS[variant], className) || undefined}
      style={base ? { ...base, ...style } : style}
      {...rest}
    >
      {children}
    </label>
  );
}
