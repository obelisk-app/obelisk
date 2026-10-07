import IconSvg, { type IconProps } from './IconSvg';

/** A microphone with a short stem, struck through. */
export default function MicOffIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.9M12 18v3M3 3l18 18" />
    </IconSvg>
  );
}
