import IconSvg, { type IconProps } from './IconSvg';

/** A magnifying glass with a short handle. */
export default function SearchShortIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </IconSvg>
  );
}
