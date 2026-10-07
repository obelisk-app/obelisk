import IconSvg, { type IconProps } from './IconSvg';

/** A microphone capsule over a cradle, without a stand. */
export default function MicCapsuleIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    </IconSvg>
  );
}
