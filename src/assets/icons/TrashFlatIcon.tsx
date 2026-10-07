import IconSvg, { type IconProps } from './IconSvg';

/** A bin with a flat lid handle and square corners. */
export default function TrashFlatIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </IconSvg>
  );
}
