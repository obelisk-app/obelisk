import IconSvg, { type IconProps } from './IconSvg';

/** A clock face. */
export default function ClockIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </IconSvg>
  );
}
