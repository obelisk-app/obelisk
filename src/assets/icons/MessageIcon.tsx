import IconSvg, { type IconProps } from './IconSvg';

/** A round speech bubble. */
export default function MessageIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12z" />
    </IconSvg>
  );
}
