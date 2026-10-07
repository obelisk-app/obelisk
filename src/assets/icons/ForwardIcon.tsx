import IconSvg, { type IconProps } from './IconSvg';

/** A curved arrow to the right: forward a message. */
export default function ForwardIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </IconSvg>
  );
}
