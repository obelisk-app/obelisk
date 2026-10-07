import IconSvg, { type IconProps } from './IconSvg';

/** A shield. */
export default function ShieldIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </IconSvg>
  );
}
