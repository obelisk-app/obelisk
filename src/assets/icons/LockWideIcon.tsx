import IconSvg, { type IconProps } from './IconSvg';

/** A padlock with a wide, flat body: an encrypted DM. */
export default function LockWideIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="11" width="18" height="9" rx="1.5" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </IconSvg>
  );
}
