import IconSvg, { type IconProps } from './IconSvg';

/** Two overlapping sheets: copy. */
export default function CopyIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </IconSvg>
  );
}
