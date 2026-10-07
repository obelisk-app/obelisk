import IconSvg, { type IconProps } from './IconSvg';

/** Two stacked server units. */
export default function ServerIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="3" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="7" rx="2" />
      <path d="M7 6.5h.01M7 17.5h.01" />
    </IconSvg>
  );
}
