import IconSvg, { type IconProps } from './IconSvg';

/** A smiling face: emoji. */
export default function SmileIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </IconSvg>
  );
}
