import IconSvg, { type IconProps } from './IconSvg';

/** A page with lines of text. */
export default function DocumentIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5M10 13h5M10 17h5" />
    </IconSvg>
  );
}
