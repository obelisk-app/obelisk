import IconSvg, { type IconProps } from './IconSvg';

/** A picture, struck through: image unavailable. */
export default function ImageOffIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m4 17 4.5-4.5 3 3 2-2L20 18" />
      <path d="m3 3 18 18" />
    </IconSvg>
  );
}
