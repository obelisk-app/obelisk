import IconSvg, { type IconProps } from './IconSvg';

/** Forward, or a collapsed tree row (rotated 90° when open). */
export default function ChevronRightIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m9 6 6 6-6 6" />
    </IconSvg>
  );
}
