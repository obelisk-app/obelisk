import IconSvg, { type IconProps } from './IconSvg';

/** A video camera. */
export default function VideoIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10.5 5-3v9l-5-3" />
    </IconSvg>
  );
}
