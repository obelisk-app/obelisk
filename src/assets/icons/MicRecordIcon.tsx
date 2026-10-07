import IconSvg, { type IconProps } from './IconSvg';

/** A microphone with a stand and base: record a voice note. */
export default function MicRecordIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
    </IconSvg>
  );
}
