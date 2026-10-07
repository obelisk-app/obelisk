import IconSvg, { type IconProps } from './IconSvg';

/** A smiling face: reactions. */
export default function SmileyIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01M15 10h.01M8.5 14s1.2 2 3.5 2 3.5-2 3.5-2" />
    </IconSvg>
  );
}
