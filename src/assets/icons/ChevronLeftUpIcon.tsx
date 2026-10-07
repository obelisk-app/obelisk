import IconSvg, { type IconProps } from './IconSvg';

/** Back in a scroll rail: a left chevron on phones, an up chevron from `md`. */
export default function ChevronLeftUpIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <polyline className="md:hidden" points="15 18 9 12 15 6" />
      <polyline className="hidden md:block" points="18 15 12 9 6 15" />
    </IconSvg>
  );
}
