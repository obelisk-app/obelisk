import IconSvg, { type IconProps } from './IconSvg';

/** A hash sign: a text channel. */
export default function HashIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </IconSvg>
  );
}
