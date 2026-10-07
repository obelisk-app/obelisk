import IconSvg, { type IconProps } from './IconSvg';

/** Headphones, struck through: deafened. */
export default function HeadphonesOffIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.5 12.5a5 5 0 0 0-8-4" />
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </IconSvg>
  );
}
