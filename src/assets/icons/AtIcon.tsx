import IconSvg, { type IconProps } from './IconSvg';

/** An at sign, for mentions. */
export default function AtIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" />
    </IconSvg>
  );
}
