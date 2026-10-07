import IconSvg, { type IconProps } from './IconSvg';

/** A minus sign. */
export default function MinusIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M6 12h12" />
    </IconSvg>
  );
}
