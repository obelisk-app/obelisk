import IconSvg, { type IconProps } from './IconSvg';

/** An arrow down into an open tray: download. */
export default function DownloadAltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </IconSvg>
  );
}
