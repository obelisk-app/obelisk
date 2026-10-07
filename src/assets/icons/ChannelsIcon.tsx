import IconSvg, { type IconProps } from './IconSvg';

/** A grid of rails with two dots: channels. */
export default function ChannelsIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M5 4v16M19 4v16M4 8h16M4 16h16" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="16" cy="16" r="1" fill="currentColor" />
    </IconSvg>
  );
}
