import IconSvg, { type IconProps } from './IconSvg';

/** Three larger filled dots in a row: more actions. */
export default function MoreLargeIcon(props: IconProps) {
  return (
    <IconSvg fill="currentColor" stroke="none" {...props}>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </IconSvg>
  );
}
