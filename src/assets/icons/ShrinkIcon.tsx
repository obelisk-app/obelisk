import IconSvg, { type IconProps } from './IconSvg';

/** Two arrows pointing into opposite corners: restore. */
export default function ShrinkIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 14h6v6" />
      <path d="M20 10h-6V4" />
      <path d="M14 10l7-7" />
      <path d="M3 21l7-7" />
    </IconSvg>
  );
}
