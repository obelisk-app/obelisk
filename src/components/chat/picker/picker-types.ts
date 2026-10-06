import type { ReactNode } from 'react';
import type { CustomEmojiMap } from '@/utils/media-tags/custom-emoji-tags';
import type { JsMediaKind } from '@/services/nostr-bridge';

export interface PickedCustomEmoji {
  readonly name: string;
  readonly url: string;
  readonly packAddress?: string;
}

export interface CustomEmojiEntry extends PickedCustomEmoji {
  readonly kind: JsMediaKind;
}

export interface EmojiPickerProps {
  onPick: (emoji: string, custom?: PickedCustomEmoji) => void;
  onClose: () => void;
  /** Emojis disabled (e.g. ones the user already reacted with). */
  disabledEmojis?: ReadonlySet<string>;
  /** When true, picking does not record in recents (useful for previews). */
  skipRecent?: boolean;
  /**
   * `popover` (default): small absolute-positioned floating panel for desktop.
   * `sheet`: fills its parent (used inside the mobile bottom-sheet host).
   * `floating`: the popover panel without its own positioning, for a host
   * that places it (`FloatingPanel`, which escapes scroll containers).
   */
  variant?: 'popover' | 'sheet' | 'floating';
  /** Popover direction relative to the trigger. Ignored for sheet variant. */
  placement?: 'above' | 'below';
  /**
   * Which edge of the trigger the popover hangs from. Defaults to `right`
   * (the composer/reaction buttons sit on the right of their row); triggers on
   * the left of a panel need `left` or the popover runs off it.
   */
  align?: 'left' | 'right';
  showClose?: boolean;
  className?: string;
  customEmojis?: CustomEmojiMap;
  customMediaKinds?: Readonly<Record<string, JsMediaKind>>;
  columns?: 7 | 12;
  customEmojiAction?: ReactNode;
  children?: ReactNode;
}
