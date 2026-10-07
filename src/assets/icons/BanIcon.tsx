import IconSvg, { type IconProps } from './IconSvg';

/** A circle with a slash: ban or block. */
export default function BanIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </IconSvg>
  );
}
