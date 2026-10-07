import IconSvg, { type IconProps } from './IconSvg';

/** Two people side by side, the second smaller. */
export default function UsersPairIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="3" />
      <path d="M23 19a4 4 0 0 0-7-2.65" />
    </IconSvg>
  );
}
