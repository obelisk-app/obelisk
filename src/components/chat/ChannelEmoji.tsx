export function isEmojiUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(https?:)?\/\//.test(value) || value.startsWith('/');
}

/**
 * Returns the emoji as plain text if it's a native/unicode emoji,
 * or an empty string if it's an image URL (which can't render inside
 * a native <option> element).
 */
export function emojiForOptionText(value: string | null | undefined): string {
  if (!value || isEmojiUrl(value)) return '';
  return value;
}

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
