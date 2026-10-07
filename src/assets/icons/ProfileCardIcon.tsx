import IconSvg, { type IconProps } from './IconSvg';

/** A person in a square: the relay profile. */
export default function ProfileCardIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20a7 7 0 0 1 14 0M4 4h16v16H4z" />
    </IconSvg>
  );
}
