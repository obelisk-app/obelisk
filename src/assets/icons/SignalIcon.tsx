import IconSvg, { type IconProps } from './IconSvg';

/** Bars of a sound wave: connection quality. */
export default function SignalIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M2 12h2" />
      <path d="M6 8v8" />
      <path d="M10 4v16" />
      <path d="M14 8v8" />
      <path d="M18 10v4" />
      <path d="M22 12h-2" />
    </IconSvg>
  );
}
