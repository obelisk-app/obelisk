import IconSvg, { type IconProps } from './IconSvg';

/** An arrow into a tray line: download. */
export default function DownloadIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </IconSvg>
  );
}
