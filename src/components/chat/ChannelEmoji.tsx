interface ChannelEmojiProps {
  value: string | null | undefined;
  className?: string;
  imgClassName?: string;
}

/**
 * Renders a channel's emoji. If `value` looks like a URL (http(s) or /uploads/),
 * renders an <img>; otherwise renders the string as text (native emoji).
 */
export default function ChannelEmoji({ value, className, imgClassName }: ChannelEmojiProps) {
  if (!value) return null;
  const isUrl = /^(https?:)?\/\//.test(value) || value.startsWith('/');
  if (isUrl) {
    return (
      <img
        src={value}
        alt=""
        className={imgClassName ?? 'inline-block w-4 h-4 object-contain align-[-2px]'}
      />
    );
  }
  return <span className={className ?? 'text-sm'}>{value}</span>;
}
