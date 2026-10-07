import IconSvg, { type IconProps } from './IconSvg';

/** An arrow up out of a tray: share. */
export default function ShareUpIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v14" />
    </IconSvg>
  );
}
