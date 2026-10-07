import IconSvg, { type IconProps } from './IconSvg';

/** A magnifying glass. */
export default function SearchIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </IconSvg>
  );
}
