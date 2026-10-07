import IconSvg, { type IconProps } from './IconSvg';

/** A laughing face: funny. */
export default function LaughIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8 10 2-1-2-1m8 2-2-1 2-1M8.5 14h7c-.8 2-2 3-3.5 3s-2.7-1-3.5-3Z" />
    </IconSvg>
  );
}
