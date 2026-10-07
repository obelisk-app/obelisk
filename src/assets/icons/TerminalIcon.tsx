import IconSvg, { type IconProps } from './IconSvg';

/** A terminal window with a prompt. */
export default function TerminalIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m6 9 3 3-3 3M12 15h6" />
    </IconSvg>
  );
}
