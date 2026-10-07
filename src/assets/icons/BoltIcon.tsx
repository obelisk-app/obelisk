import IconSvg, { type IconProps } from './IconSvg';

/** A lightning bolt (wider than the zap icon). */
export default function BoltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </IconSvg>
  );
}
