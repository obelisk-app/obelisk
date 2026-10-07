import IconSvg, { type IconProps } from './IconSvg';

/** An arrow that turns up and left: reply. */
export default function CornerUpLeftIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </IconSvg>
  );
}
