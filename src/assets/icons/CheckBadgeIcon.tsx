import IconSvg, { type IconProps } from './IconSvg';

/** A rosette with a tick: verified. */
export default function CheckBadgeIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 2 14.4 4.2 17.7 4 18 7.3 20.4 9.6 18.9 12.5 20.4 15.4 18 17.7 17.7 21 14.4 20.8 12 23 9.6 20.8 6.3 21 6 17.7 3.6 15.4 5.1 12.5 3.6 9.6 6 7.3 6.3 4 9.6 4.2z" />
      <path d="m8.5 12.5 2.3 2.3 4.7-4.7" />
    </IconSvg>
  );
}
