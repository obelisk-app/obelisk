import IconSvg, { type IconProps } from './IconSvg';

/** A paper plane. */
export default function PaperPlaneIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9z" />
    </IconSvg>
  );
}
