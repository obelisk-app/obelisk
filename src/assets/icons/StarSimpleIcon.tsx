import IconSvg, { type IconProps } from './IconSvg';

/** A plain five-pointed star: roles. */
export default function StarSimpleIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 3 9.5 8 4 9l4 4-1 6 5-3 5 3-1-6 4-4-5.5-1z" />
    </IconSvg>
  );
}
