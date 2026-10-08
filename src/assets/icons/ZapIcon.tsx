import IconSvg, { type IconProps } from './IconSvg';

/**
 * A lightning bolt: zaps, Lightning payments and the wallet. Outline by
 * default like every icon here; `filled` fills the same bolt (the zap modal
 * and the zap total pill), and a caller may pass `fill` itself.
 */
export default function ZapIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <IconSvg {...props} {...(filled ? { fill: 'currentColor' } : {})}>
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
    </IconSvg>
  );
}
