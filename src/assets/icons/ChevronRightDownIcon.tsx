import IconSvg, { type IconProps } from './IconSvg';

/** On in a scroll rail: a right chevron on phones, a down chevron from `md`. */
export default function ChevronRightDownIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <polyline className="md:hidden" points="9 18 15 12 9 6" />
      <polyline className="hidden md:block" points="6 9 12 15 18 9" />
    </IconSvg>
  );
}
