import IconSvg, { type IconProps } from './IconSvg';

/** A plain tick, for "copied" and "done" confirmations. */
export default function CheckIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </IconSvg>
  );
}
