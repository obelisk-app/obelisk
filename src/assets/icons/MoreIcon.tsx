import IconSvg, { type IconProps } from './IconSvg';

/** Three filled dots in a row: more actions. */
export default function MoreIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </IconSvg>
  );
}
