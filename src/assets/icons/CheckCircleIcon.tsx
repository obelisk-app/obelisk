import IconSvg, { type IconProps } from './IconSvg';

/** A tick in a circle. */
export default function CheckCircleIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16.5 9.5" />
    </IconSvg>
  );
}
