import { describe, expect, it } from 'vitest';
import { json, rawEventFacts, splitDmImages } from '@/utils/chat/dm/dm-message-utils';
import type { JsDirectMessage } from '@/services/nostr-bridge';

describe('DM message helpers', () => {
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
