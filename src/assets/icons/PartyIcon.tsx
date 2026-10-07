import IconSvg, { type IconProps } from './IconSvg';

/** A party popper: celebration. */
export default function PartyIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m5 19 4-10 6 6-10 4ZM13 5l1-2m3 6 3-1m-2 5 2 1M9 4 8 2" />
    </IconSvg>
  );
}
