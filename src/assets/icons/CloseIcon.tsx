import IconSvg, { type IconProps } from './IconSvg';

/** An X: close or dismiss. */
export default function CloseIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </IconSvg>
  );
}
