import IconSvg, { type IconProps } from './IconSvg';

/** Two chain links. */
export default function LinkIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </IconSvg>
  );
}
