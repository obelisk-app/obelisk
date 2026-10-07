import IconSvg, { type IconProps } from './IconSvg';

/** A plus sign: add. */
export default function PlusIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconSvg>
  );
}
