import IconSvg, { type IconProps } from './IconSvg';

/** A bin with a rounded handle and two slots. */
export default function TrashRoundIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </IconSvg>
  );
}
