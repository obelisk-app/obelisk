import IconSvg, { type IconProps } from './IconSvg';

/** A picture: a sun over a mountain line. */
export default function ImageIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </IconSvg>
  );
}
