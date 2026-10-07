import IconSvg, { type IconProps } from './IconSvg';

/** An arrow pointing down. */
export default function ArrowDownIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </IconSvg>
  );
}
