import IconSvg, { type IconProps } from './IconSvg';

/** YouTube's glyph: a rounded screen with a filled play triangle. */
export default function YouTubeIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" />
    </IconSvg>
  );
}
