import IconSvg, { type IconProps } from './IconSvg';

/** A curved arrow to the left: reply. */
export default function ReplyIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </IconSvg>
  );
}
