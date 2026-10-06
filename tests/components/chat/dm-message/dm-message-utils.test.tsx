import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hexToNpub } from '@nostr-wot/data';
import { json, rawEventFacts, safeNpub, splitDmImages } from '@/components/chat/dm-message/dm-message-utils';
import { TextWithEmoji } from '@/components/chat/dm-message/TextWithEmoji';
import { emojiForOptionText, isEmojiUrl } from '@/components/chat/channel-emoji';
import type { JsDirectMessage } from '@/services/nostr-bridge';

const HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';

describe('DM message helpers', () => {
  it('encodes an npub, or hands back what does not encode', () => {
    expect(safeNpub(HEX)).toBe(hexToNpub(HEX));
    expect(safeNpub('nope')).toBe('nope');
  });

  it('pretty-prints an event', () => {
    expect(json({ id: 'x', kind: 14 } as never)).toBe('{\n  "id": "x",\n  "kind": 14\n}');
  });

  it('reads the raw-event facts of a DM', () => {
    const nip17 = { raw: { rumor: { kind: 15, tags: [['decryption-key', 'k']] }, wire: { kind: 1059 } } } as unknown as JsDirectMessage;
    expect(rawEventFacts(nip17)).toMatchObject({ holdsKey: true, nip04: false });
    const legacy = { protocol: 'nip04', raw: { wire: { kind: 4 } } } as unknown as JsDirectMessage;
    expect(rawEventFacts(legacy)).toMatchObject({ rumor: undefined, nip04: true, holdsKey: false });
  });

  it('cuts up to four image URLs out of the text', () => {
    const urls = [1, 2, 3, 4, 5].map((n) => `https://x/${n}.png`);
    const { images, text } = splitDmImages(`look\n\n\n\n${urls.join(' ')}`);
    expect(images).toEqual(urls.slice(0, 4));
    expect(text).toBe('look\n\n    https://x/5.png');
  });
});

describe('TextWithEmoji', () => {
  it('links URLs and draws known custom emoji, repeatedly, without placeholder text leaking', () => {
    for (let i = 0; i < 3; i += 1) {
      const { container, unmount } = render(
        <TextWithEmoji text="hi :obelisk_logo: see https://x.example/a" emojis={{ obelisk_logo: 'https://x/logo.png' }} linkClass="l" />,
      );
      expect(container.querySelectorAll('img')).toHaveLength(1);
      expect(container.querySelector('a')).toHaveAttribute('href', 'https://x.example/a');
      expect(container.textContent).not.toContain('〈');
      unmount();
    }
  });
});

describe('channel emoji', () => {
  it('tells image URLs from characters', () => {
    expect(isEmojiUrl('https://x/e.png')).toBe(true);
    expect(isEmojiUrl('//cdn/e.png')).toBe(true);
    expect(isEmojiUrl('/uploads/e.png')).toBe(true);
    expect(isEmojiUrl('🎉')).toBe(false);
    expect(isEmojiUrl(null)).toBe(false);
    expect(emojiForOptionText('🎉')).toBe('🎉');
    expect(emojiForOptionText('https://x/e.png')).toBe('');
  });
});
