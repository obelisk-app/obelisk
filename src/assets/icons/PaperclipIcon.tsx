import IconSvg, { type IconProps } from './IconSvg';

/** A paperclip: attach. */
export default function PaperclipIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
    </IconSvg>
  );
}
