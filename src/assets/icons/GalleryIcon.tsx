import IconSvg, { type IconProps } from './IconSvg';

/** A small picture: other media. */
export default function GalleryIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="m7 15 3-3 3 3 2-2 2 2M8 9h.01" />
    </IconSvg>
  );
}
