import IconSvg, { type IconProps } from './IconSvg';

/** Three left-aligned lines of falling length: quote. */
export default function QuoteIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M17 6H3" />
      <path d="M21 12H3" />
      <path d="M15 18H3" />
    </IconSvg>
  );
}
