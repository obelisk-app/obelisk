import IconSvg, { type IconProps } from './IconSvg';

/** A clock with a turning arrow: recent. */
export default function RecentIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </IconSvg>
  );
}
