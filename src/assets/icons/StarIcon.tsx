import IconSvg, { type IconProps } from './IconSvg';

/** A five-pointed star. Outline by default; pass `filled` for the "on" state (favorited). */
export default function StarIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <IconSvg {...props} fill={filled ? 'currentColor' : 'none'}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    </IconSvg>
  );
}
