import IconSvg, { type IconProps } from './IconSvg';

/** A football: sports. */
export default function BallIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="m9 9 3-2 3 2-1 4h-4L9 9Zm1 4-3 2m7-2 3 2m-5-8V4m-2 15 2-3 2 3" />
    </IconSvg>
  );
}
