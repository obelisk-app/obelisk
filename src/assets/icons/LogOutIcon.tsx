import IconSvg, { type IconProps } from './IconSvg';

/** An arrow leaving a door frame: log out. */
export default function LogOutIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </IconSvg>
  );
}
