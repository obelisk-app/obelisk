import IconSvg, { type IconProps } from './IconSvg';

/** A wrench: tools. */
export default function WrenchIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M14.7 6.3a4 4 0 0 0 5 5L22 13.6a1 1 0 0 1 0 1.4l-.6.6a1 1 0 0 1-1.4 0l-2.3-2.3a4 4 0 0 1-5-5L3.3 17.7a2.1 2.1 0 0 0 3 3l9.4-9.4" />
    </IconSvg>
  );
}
