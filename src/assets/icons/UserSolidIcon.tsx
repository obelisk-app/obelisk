import IconSvg, { type IconProps } from './IconSvg';

/** A filled person. */
export default function UserSolidIcon(props: IconProps) {
  return (
    <IconSvg fill="currentColor" stroke="none" {...props}>
      <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0Z" />
    </IconSvg>
  );
}
