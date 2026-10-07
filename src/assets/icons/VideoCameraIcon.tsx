import IconSvg, { type IconProps } from './IconSvg';

/** A box camera with a lens cone: the voice room's camera control. */
export default function VideoCameraIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </IconSvg>
  );
}
