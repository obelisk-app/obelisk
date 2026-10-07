import IconSvg, { type IconProps } from './IconSvg';

/** A bin without a handle: clear. */
export default function BinIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    </IconSvg>
  );
}
