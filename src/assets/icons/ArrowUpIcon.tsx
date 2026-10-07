import IconSvg, { type IconProps } from './IconSvg';

/** An arrow pointing up. */
export default function ArrowUpIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </IconSvg>
  );
}
