import type { JsMediaKind } from '@/services/nostr-bridge';

/** What the emoji and media pickers hand back for a custom (image) emoji; shared by the picker hooks, parts and helpers. */
export interface PickedCustomEmoji {
  readonly name: string;
  readonly url: string;
  readonly packAddress?: string;
}

export interface CustomEmojiEntry extends PickedCustomEmoji {
  readonly kind: JsMediaKind;
}
