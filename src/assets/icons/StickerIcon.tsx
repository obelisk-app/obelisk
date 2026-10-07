import IconSvg, { type IconProps } from './IconSvg';

/** A sticker with a peeled corner and a face. */
export default function StickerIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M6 3h12a3 3 0 0 1 3 3v8l-7 7H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" />
      <path d="M14 21v-4a3 3 0 0 1 3-3h4M8 10h.01M16 10h.01M8 14s1.5 1.5 4 1.5 4-1.5 4-1.5" />
    </IconSvg>
  );
}
