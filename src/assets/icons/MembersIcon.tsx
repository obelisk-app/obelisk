import IconSvg, { type IconProps } from './IconSvg';

/** Two people of different sizes: members. */
export default function MembersIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2" />
      <path d="M3 20a6 6 0 0 1 12 0M14 16a5 5 0 0 1 7 4" />
    </IconSvg>
  );
}
