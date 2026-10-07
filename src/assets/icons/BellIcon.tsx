import IconSvg, { type IconProps } from './IconSvg';

/** A notification bell. */
export default function BellIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </IconSvg>
  );
}
