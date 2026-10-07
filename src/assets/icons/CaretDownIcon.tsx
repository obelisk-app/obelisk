import IconSvg, { type IconProps } from './IconSvg';

/** A small chevron on a 10-unit grid: a dropdown. */
export default function CaretDownIcon(props: IconProps) {
  return (
    <IconSvg viewBox="0 0 10 10" {...props}>
      <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconSvg>
  );
}
