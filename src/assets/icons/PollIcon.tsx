import IconSvg, { type IconProps } from './IconSvg';

/** Three bars on a baseline: a poll. */
export default function PollIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M5 19V9M12 19V5M19 19v-7" />
      <path d="M3 19h18" />
    </IconSvg>
  );
}
