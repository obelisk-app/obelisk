import IconSvg, { type IconProps } from './IconSvg';

/** An arrow into a door frame: log in. */
export default function LogInIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </IconSvg>
  );
}
