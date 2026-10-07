import IconSvg, { type IconProps } from './IconSvg';

/** A padlock with a medium body. */
export default function LockMediumIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </IconSvg>
  );
}
