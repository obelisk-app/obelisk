import IconSvg, { type IconProps } from './IconSvg';

/** A paper plane: send a message, and the direct-messages entry in the navigation. */
export default function SendIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9z" />
    </IconSvg>
  );
}
