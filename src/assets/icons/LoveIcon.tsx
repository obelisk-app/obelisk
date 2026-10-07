import IconSvg, { type IconProps } from './IconSvg';

/** A rounded heart: love. */
export default function LoveIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M20 9c0 5-8 10-8 10S4 14 4 9a4 4 0 0 1 7-2.6A4 4 0 0 1 20 9Z" />
    </IconSvg>
  );
}
