import IconSvg, { type IconProps } from './IconSvg';

/** A push pin: pinned. */
export default function PinIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 17v5" />
      <path d="M9 10.76V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4.76a2 2 0 0 0 .55 1.39l1.65 1.7A1 1 0 0 1 16.5 15.5h-9A1 1 0 0 1 6.8 13.85l1.65-1.7A2 2 0 0 0 9 10.76z" />
    </IconSvg>
  );
}
