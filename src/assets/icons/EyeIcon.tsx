import IconSvg, { type IconProps } from './IconSvg';

/** Show a masked secret (password, nsec). */
export default function EyeIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </IconSvg>
  );
}
