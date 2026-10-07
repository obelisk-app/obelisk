import IconSvg, { type IconProps } from './IconSvg';

/**
 * Zap. Outline by default like every icon here; `filled` is the solid bolt the
 * zap modal and the zap total pill use. It draws its own path with the stroke
 * switched off.
 */
export default function ZapIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return filled ? (
    <IconSvg {...props} fill="currentColor" stroke="none">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </IconSvg>
  ) : (
    <IconSvg {...props}>
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
    </IconSvg>
  );
}
