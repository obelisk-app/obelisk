import IconSvg, { type IconProps } from './IconSvg';

/** A key with a round bow. */
export default function KeyIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.8-8.8M16 7l3 3M18.5 4.5l2 2" />
    </IconSvg>
  );
}
