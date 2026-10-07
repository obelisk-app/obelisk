import IconSvg, { type IconProps } from './IconSvg';

/** An arrow up out of a tray: upload. */
export default function UploadIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </IconSvg>
  );
}
