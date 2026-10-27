import IconSvg, { type IconProps } from './IconSvg';

/** The X (formerly Twitter) logo; `CloseIcon` is the plain × for dismissing. */
export default function XLogoIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 4h4.5L20 20h-4.5z" />
      <path d="M20 4l-6.6 7.4M4 20l6.6-7.4" />
    </IconSvg>
  );
}
