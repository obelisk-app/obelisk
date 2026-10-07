import IconSvg, { type IconProps } from './IconSvg';

/** A page with a folded corner. */
export default function FileIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </IconSvg>
  );
}
