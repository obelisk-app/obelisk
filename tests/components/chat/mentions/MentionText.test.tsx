import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { MentionText } from '@/components/chat/mentions/MentionText';
import { shortNpub } from '@/utils/message-text/mentions';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

describe('MentionText', () => {
  it('writes mentions as @name around the text, falling back to a short npub', () => {
    const bridge = fakeBridge({ userMetadata: { [ALICE]: { displayName: 'Alice', name: 'alice' } } as never });
    const content = `hi nostr:${nip19.npubEncode(ALICE)} and nostr:${nip19.npubEncode(BOB)}!`;
    const { container } = renderWithBridge(<MentionText content={content} />, bridge);
    expect(container.textContent).toBe(`hi @Alice and @${shortNpub(BOB)}!`);
  });

  it('uses the name when there is no display name, and leaves plain text alone', () => {
    const bridge = fakeBridge({ userMetadata: { [ALICE]: { name: 'alice' } } as never });
    const { container } = renderWithBridge(<MentionText content={`nostr:${nip19.npubEncode(ALICE)}`} />, bridge);
    expect(container.textContent).toBe('@alice');
    const plain = renderWithBridge(<MentionText content="no mentions" />, bridge);
    expect(plain.container.textContent).toBe('no mentions');
  });
});
