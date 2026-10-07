import IconSvg, { type IconProps } from './IconSvg';

/** A cat face: animals. */
export default function CatIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m6 9-1-5 5 3h4l5-3-1 5a7 7 0 1 1-12 0Z" />
      <path d="M9 12h.01M15 12h.01M10 15h4" />
    </IconSvg>
  );
}
