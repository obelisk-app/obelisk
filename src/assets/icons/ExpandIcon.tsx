import IconSvg, { type IconProps } from './IconSvg';

/** Two arrows pointing out of opposite corners: expand. */
export default function ExpandIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </IconSvg>
  );
}
