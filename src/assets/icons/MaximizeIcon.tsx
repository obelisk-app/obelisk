import IconSvg, { type IconProps } from './IconSvg';

/** Four outward corners: enlarge. */
export default function MaximizeIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </IconSvg>
  );
}
