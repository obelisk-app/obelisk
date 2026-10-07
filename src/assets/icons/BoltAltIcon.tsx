import IconSvg, { type IconProps } from './IconSvg';

/** A narrow lightning bolt: zap. */
export default function BoltAltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M13 2 3 14h7l-2 8 10-12h-7l2-8z" />
    </IconSvg>
  );
}
