import IconSvg, { type IconProps } from './IconSvg';

/** Instagram's camera glyph: a rounded square, a lens and the flash dot. */
export default function InstagramIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </IconSvg>
  );
}
