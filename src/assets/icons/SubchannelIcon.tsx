import IconSvg, { type IconProps } from './IconSvg';

/** A curved branch pointing into a subchannel. */
export default function SubchannelIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M5 5v6a5 5 0 0 0 5 5h9M15 12l4 4-4 4" />
    </IconSvg>
  );
}
