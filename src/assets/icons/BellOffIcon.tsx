import IconSvg, { type IconProps } from './IconSvg';

/** A notification bell, struck through. */
export default function BellOffIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M8.7 3.3A6 6 0 0 1 18 8c0 3.1.7 5.1 1.4 6.4M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0M2 2l20 20" />
    </IconSvg>
  );
}
