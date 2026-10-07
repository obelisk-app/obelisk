import IconSvg, { type IconProps } from './IconSvg';

/** A small microphone with a short stem. */
export default function MicSmallIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </IconSvg>
  );
}
