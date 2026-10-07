import IconSvg, { type IconProps } from './IconSvg';

/** A key with a round bow at the lower left and two teeth. */
export default function KeyAltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </IconSvg>
  );
}
