import IconSvg, { type IconProps } from './IconSvg';

/** A padlock with a narrow body. */
export default function LockIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </IconSvg>
  );
}
