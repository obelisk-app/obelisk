import IconSvg, { type IconProps } from './IconSvg';

/** A camera with turning arrows: switch camera. */
export default function FlipCameraIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4Z" />
      <path d="M9.5 13.5a2.5 2.5 0 0 1 4.3-1.8M14.5 13.5a2.5 2.5 0 0 1-4.3 1.8M13.8 10.2v1.5h-1.5M10.2 16.8v-1.5h1.5" />
    </IconSvg>
  );
}
