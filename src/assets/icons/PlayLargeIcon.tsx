import IconSvg, { type IconProps } from './IconSvg';

/** A larger filled triangle: play. */
export default function PlayLargeIcon(props: IconProps) {
  return (
    <IconSvg fill="currentColor" stroke="none" {...props}>
      <path d="m7 4 13 8-13 8z" />
    </IconSvg>
  );
}
