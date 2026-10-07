import IconSvg, { type IconProps } from './IconSvg';

/** Three centred lines of falling length: filter. */
export default function FilterIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 5h18" />
      <path d="M6 12h12" />
      <path d="M10 19h4" />
    </IconSvg>
  );
}
