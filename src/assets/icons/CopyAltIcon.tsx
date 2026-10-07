import IconSvg, { type IconProps } from './IconSvg';

/** A sheet in front of a corner bracket: copy. */
export default function CopyAltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </IconSvg>
  );
}
