import IconSvg, { type IconProps } from './IconSvg';

/** Six dots in two columns: drag to reorder. */
export default function DragHandleIcon(props: IconProps) {
  return (
    <IconSvg fill="currentColor" stroke="none" viewBox="0 0 14 14" {...props}>
      <circle cx="4" cy="3" r="1" />
      <circle cx="10" cy="3" r="1" />
      <circle cx="4" cy="7" r="1" />
      <circle cx="10" cy="7" r="1" />
      <circle cx="4" cy="11" r="1" />
      <circle cx="10" cy="11" r="1" />
    </IconSvg>
  );
}
