import IconSvg, { type IconProps } from './IconSvg';

/** Six solid dots in two columns: drag to reorder. A filled glyph. */
export default function DragHandleIcon(props: IconProps) {
  return (
    <IconSvg fill="currentColor" stroke="none" {...props}>
      <circle cx="6.9" cy="5.1" r="1.7" />
      <circle cx="17.1" cy="5.1" r="1.7" />
      <circle cx="6.9" cy="12" r="1.7" />
      <circle cx="17.1" cy="12" r="1.7" />
      <circle cx="6.9" cy="18.9" r="1.7" />
      <circle cx="17.1" cy="18.9" r="1.7" />
    </IconSvg>
  );
}
