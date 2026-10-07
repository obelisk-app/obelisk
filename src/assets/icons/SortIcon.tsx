import IconSvg, { type IconProps } from './IconSvg';

/** An up arrow and a down arrow: sort. */
export default function SortIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M7 4v16" />
      <path d="m3 8 4-4 4 4" />
      <path d="M17 20V4" />
      <path d="m21 16-4 4-4-4" />
    </IconSvg>
  );
}
