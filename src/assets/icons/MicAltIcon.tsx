import IconSvg, { type IconProps } from './IconSvg';

/** A microphone with a stand, drawn with a rectangle capsule. */
export default function MicAltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0014 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </IconSvg>
  );
}
