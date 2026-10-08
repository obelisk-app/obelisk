import IconSvg, { type IconProps } from './IconSvg';

/** A bulleted list: a forum channel (a list of threads). Not MenuIcon's three bars. */
export default function ListIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </IconSvg>
  );
}
