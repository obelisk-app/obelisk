import IconSvg, { type IconProps } from './IconSvg';

/** Hide a revealed secret again. */
export default function EyeOffIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.7 3.6M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </IconSvg>
  );
}
