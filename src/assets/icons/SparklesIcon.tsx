import IconSvg, { type IconProps } from './IconSvg';

/** A large and a small four-point sparkle: something new or generated. */
export default function SparklesIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M19 15l.7 1.7L21.5 17.5l-1.8.8L19 20l-.7-1.7L16.5 17.5l1.8-.8z" />
    </IconSvg>
  );
}
