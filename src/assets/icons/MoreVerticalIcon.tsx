import IconSvg, { type IconProps } from './IconSvg';

/** Three dots in a column: more actions. */
export default function MoreVerticalIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </IconSvg>
  );
}
