import IconSvg, { type IconProps } from './IconSvg';

/** A person: a head over a half circle. */
export default function UserRoundIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </IconSvg>
  );
}
