import IconSvg, { type IconProps } from './IconSvg';

/** A filled triangle: play. */
export default function PlayIcon(props: IconProps) {
  return (
    <IconSvg fill="currentColor" stroke="none" {...props}>
      <path d="M8 5v14l11-7z" />
    </IconSvg>
  );
}
