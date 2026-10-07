import IconSvg, { type IconProps } from './IconSvg';

/** A closed book. */
export default function BookIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </IconSvg>
  );
}
