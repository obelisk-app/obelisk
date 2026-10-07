import IconSvg, { type IconProps } from './IconSvg';

/** A compass: explore. */
export default function CompassIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z" />
    </IconSvg>
  );
}
