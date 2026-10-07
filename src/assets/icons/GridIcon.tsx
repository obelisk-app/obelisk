import IconSvg, { type IconProps } from './IconSvg';

/** Four rounded squares: spaces. */
export default function GridIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </IconSvg>
  );
}
