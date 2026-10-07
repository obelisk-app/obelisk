import IconSvg, { type IconProps } from './IconSvg';

/** A phone handset turned down: hang up. */
export default function PhoneOffIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 12.5c5-4.4 13-4.4 18 0l-2.2 2.9-3.3-1.4v-2.4a10 10 0 0 0-7 0V14l-3.3 1.4Z" />
    </IconSvg>
  );
}
