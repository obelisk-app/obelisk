import IconSvg, { type IconProps } from './IconSvg';

/** Two people, drawn one unit wider than `UsersIcon`. */
export default function UsersAltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconSvg>
  );
}
