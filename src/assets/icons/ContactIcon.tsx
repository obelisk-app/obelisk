import IconSvg, { type IconProps } from './IconSvg';

/** A person between two rails: a contact card. */
export default function ContactIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M6 20a6 6 0 0 1 12 0M4 4v16M20 4v16" />
    </IconSvg>
  );
}
