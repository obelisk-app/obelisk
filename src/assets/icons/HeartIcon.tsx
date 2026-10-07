import IconSvg, { type IconProps } from './IconSvg';

/** A heart: like. */
export default function HeartIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </IconSvg>
  );
}
