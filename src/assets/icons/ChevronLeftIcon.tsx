import IconSvg, { type IconProps } from './IconSvg';

/** Back. The mobile back buttons size it from CSS, so pass `size={null}` there. */
export default function ChevronLeftIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m15 18-6-6 6-6" />
    </IconSvg>
  );
}
