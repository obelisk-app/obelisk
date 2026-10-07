import IconSvg, { type IconProps } from './IconSvg';

/** Two stacked squares: several pictures. */
export default function StackIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="8" y="3" width="13" height="13" rx="2" />
      <path d="M3 8v11a2 2 0 0 0 2 2h11" />
    </IconSvg>
  );
}
