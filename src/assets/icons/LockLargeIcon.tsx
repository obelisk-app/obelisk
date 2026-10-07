import IconSvg, { type IconProps } from './IconSvg';

/** A padlock with a wide, tall body. */
export default function LockLargeIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </IconSvg>
  );
}
