import IconSvg, { type IconProps } from './IconSvg';

/** A paint palette: appearance. */
export default function PaletteIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2.5a1.5 1.5 0 0 0-1 2.6A1.9 1.9 0 0 1 12 22z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="12" cy="7" r="1" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" />
    </IconSvg>
  );
}
