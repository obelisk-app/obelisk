import IconSvg, { type IconProps } from './IconSvg';

/** A screen with an up arrow: share the screen. */
export default function ScreenShareIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4M12 13V8M9.5 10.5 12 8l2.5 2.5" />
    </IconSvg>
  );
}
