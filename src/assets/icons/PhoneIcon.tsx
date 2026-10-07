import IconSvg, { type IconProps } from './IconSvg';

/** A phone handset: call. */
export default function PhoneIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M5 4h3.5l1.8 4.4-2.3 1.5a11 11 0 0 0 6.1 6.1l1.5-2.3L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    </IconSvg>
  );
}
