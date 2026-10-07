import IconSvg, { type IconProps } from './IconSvg';

/** A question mark in a circle: help. */
export default function HelpCircleIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </IconSvg>
  );
}
