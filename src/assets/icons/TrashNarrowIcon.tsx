import IconSvg, { type IconProps } from './IconSvg';

/** A narrow bin: discard a draft. */
export default function TrashNarrowIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </IconSvg>
  );
}
