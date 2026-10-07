import IconSvg, { type IconProps } from './IconSvg';

/** A magnifying glass with a wider lens. */
export default function SearchWideIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </IconSvg>
  );
}
