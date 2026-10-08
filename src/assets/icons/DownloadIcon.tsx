import IconSvg, { type IconProps } from './IconSvg';

/** An arrow down into a tray: download (the mirror of UploadIcon). */
export default function DownloadIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </IconSvg>
  );
}
