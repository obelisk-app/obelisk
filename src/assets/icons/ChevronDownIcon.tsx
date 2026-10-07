import IconSvg, { type IconProps } from './IconSvg';

/** Move down / expand downward; the `↓` glyph's replacement in reorder controls. */
export default function ChevronDownIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconSvg>
  );
}
