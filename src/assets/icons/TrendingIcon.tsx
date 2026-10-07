import IconSvg, { type IconProps } from './IconSvg';

/** A rising line with an arrow: trending. */
export default function TrendingIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m4 16 5-5 4 4 7-8" />
      <path d="M15 7h5v5" />
    </IconSvg>
  );
}
