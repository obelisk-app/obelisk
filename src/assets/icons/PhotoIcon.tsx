import IconSvg, { type IconProps } from './IconSvg';

/** A landscape picture in a wide frame. */
export default function PhotoIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4 17 5-4 3 2 3-3 5 5" />
    </IconSvg>
  );
}
