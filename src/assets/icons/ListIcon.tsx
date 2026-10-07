import IconSvg, { type IconProps } from './IconSvg';

/** Three long lines. */
export default function ListIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 5h18M3 12h18M3 19h18" />
    </IconSvg>
  );
}
