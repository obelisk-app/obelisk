import IconSvg, { type IconProps } from './IconSvg';

/** A person with a small plus beside the head: members of a role. */
export default function UserAddIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M17 11h4M19 9v4" />
    </IconSvg>
  );
}
