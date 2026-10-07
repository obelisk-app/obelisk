import IconSvg, { type IconProps } from './IconSvg';

/** A box with an arrow out of its corner: open elsewhere. */
export default function ExternalIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14 21 3" />
    </IconSvg>
  );
}
