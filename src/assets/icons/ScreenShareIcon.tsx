import IconSvg, { type IconProps } from './IconSvg';

/**
 * A screen with an up arrow: share the screen. `checked` swaps the arrow
 * for a tick while the screen is being shared.
 */
export default function ScreenShareIcon({ checked = false, ...props }: IconProps & { checked?: boolean }) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
      {checked ? <path d="m9 10 2 2 4-4" /> : <path d="M12 13V8M9.5 10.5 12 8l2.5 2.5" />}
    </IconSvg>
  );
}
