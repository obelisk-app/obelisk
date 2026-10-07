import IconSvg, { type IconProps } from './IconSvg';

/** A camera with turning arrows: the voice room's switch-camera control. */
export default function SwitchCameraIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M20 4h-3.17L15 2H9L7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <path d="M9 13a3 3 0 0 0 5.5 1.66" />
      <path d="M15 11a3 3 0 0 0-5.5-1.66" />
      <polyline points="14.5 8.5 15 11 12.5 11.5" />
      <polyline points="9.5 15.5 9 13 11.5 12.5" />
    </IconSvg>
  );
}
