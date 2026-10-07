import IconSvg, { type IconProps } from './IconSvg';

/** Move up / expand upward; the `↑` glyph's replacement in reorder controls. */
export default function ChevronUpIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m18 15-6-6-6 6" />
    </IconSvg>
  );
}
