import IconSvg, { type IconProps } from './IconSvg';

/** Four inward corners: shrink. */
export default function MinimizeIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </IconSvg>
  );
}
