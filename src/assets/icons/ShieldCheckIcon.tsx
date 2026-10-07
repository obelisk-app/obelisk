import IconSvg, { type IconProps } from './IconSvg';

/** A shield with a tick: quantum-safe. */
export default function ShieldCheckIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 11.5l2 2 4-4" />
    </IconSvg>
  );
}
