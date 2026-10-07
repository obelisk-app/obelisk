import IconSvg, { type IconProps } from './IconSvg';

/** A photo camera with a flat body. */
export default function CameraAltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </IconSvg>
  );
}
