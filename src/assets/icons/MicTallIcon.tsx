import IconSvg, { type IconProps } from './IconSvg';

/** A tall microphone capsule over its cradle and stem: a tile's mute-for-me control. */
export default function MicTallIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </IconSvg>
  );
}
