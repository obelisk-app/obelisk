import IconSvg, { type IconProps } from './IconSvg';

/** A warning triangle. */
export default function AlertTriangleIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </IconSvg>
  );
}
