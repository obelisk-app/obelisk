import IconSvg, { type IconProps } from './IconSvg';

/** A page with a folded corner, drawn taller. */
export default function FileAltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </IconSvg>
  );
}
