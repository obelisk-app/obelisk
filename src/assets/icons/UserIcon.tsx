import IconSvg, { type IconProps } from './IconSvg';

/** A person, head and shoulders. */
export default function UserIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </IconSvg>
  );
}
