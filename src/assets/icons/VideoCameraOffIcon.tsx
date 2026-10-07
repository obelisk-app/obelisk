import IconSvg, { type IconProps } from './IconSvg';

/** A box camera, struck through: the voice room's camera-off control. */
export default function VideoCameraOffIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
    </IconSvg>
  );
}
