import IconSvg, { type IconProps } from './IconSvg';

/** Three sliders: settings. */
export default function SettingsIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </IconSvg>
  );
}
