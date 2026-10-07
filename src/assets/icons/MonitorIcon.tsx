import IconSvg, { type IconProps } from './IconSvg';

/** A monitor on a stand: the voice room's screen-share control; `checked` adds a tick while sharing. */
export default function MonitorIcon({ checked = false, ...props }: IconProps & { checked?: boolean }) {
  return (
    <IconSvg {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      {checked && <path d="M8 10l3 3 5-6" />}
    </IconSvg>
  );
}
