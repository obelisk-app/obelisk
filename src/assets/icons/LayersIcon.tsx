import IconSvg, { type IconProps } from './IconSvg';

/** Three stacked layers. */
export default function LayersIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m12 2 10 5-10 5L2 7z" />
      <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
    </IconSvg>
  );
}
