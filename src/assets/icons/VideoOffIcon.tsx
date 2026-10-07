import IconSvg, { type IconProps } from './IconSvg';

/** A video camera, struck through. */
export default function VideoOffIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M10 6h4a2 2 0 0 1 2 2v2.5l5-3v9l-3-1.8M16 16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M3 3l18 18" />
    </IconSvg>
  );
}
