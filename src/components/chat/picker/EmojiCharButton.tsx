'use client';

import Button from '@/components/ui/buttons/Button';

/** One Unicode emoji in a grid; disabled (and titled so) when already reacted. */
export function EmojiCharButton({
  char,
  keyword,
  disabled,
  disabledTitle,
  className,
  onPick,
}: {
  char: string;
  keyword: string;
  disabled: boolean;
  /** The title of a disabled button, already in the reader's language. */
  disabledTitle: string;
  className: string;
  onPick: (char: string) => void;
}) {
  return (
    <Button
      variant="bare"
      type="button"
      onClick={() => onPick(char)}
      disabled={disabled}
      className={className}
      title={disabled ? disabledTitle : keyword}
    >
      {char}
    </Button>
  );
}
