import IconSvg, { type IconProps } from './IconSvg';

/** A picture with a sun and a falling line. */
export default function PictureIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L9 18" />
    </IconSvg>
  );
}
