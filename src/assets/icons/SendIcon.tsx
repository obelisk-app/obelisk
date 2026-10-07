import IconSvg, { type IconProps } from './IconSvg';

/** A tilted arrowhead: send. */
export default function SendIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m5 12 14-7-7 14-2-5-5-2z" />
    </IconSvg>
  );
}
