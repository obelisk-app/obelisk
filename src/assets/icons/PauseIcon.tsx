import IconSvg, { type IconProps } from './IconSvg';

/** Two filled bars: pause. */
export default function PauseIcon(props: IconProps) {
  return (
    <IconSvg fill="currentColor" stroke="none" {...props}>
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </IconSvg>
  );
}
