import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useUserMetadata: () => null });
});

import { processChildren, renderWithMentions } from '@/components/chat/message/placeholders';
import { EVERYONE_PLACEHOLDER } from '@/utils/message-text/markdown';

const mentions = new Map([['0', { pubkey: 'a'.repeat(64), displayName: 'Alice' }]]);
const emojis = { party: 'https://x/party.png' };

describe('renderWithMentions', () => {
  it('swaps every placeholder kind in one pass', () => {
    const text = `hi 〈MENTION:0〉 ${EVERYONE_PLACEHOLDER} 〈EMOJI:party〉 〈EMOJI:gone〉 〈`;
    const { container, getByTestId } = render(<>{renderWithMentions(text, mentions, emojis)}</>);
    expect(getByTestId('mention-highlight')).toHaveTextContent('@Alice');
    expect(getByTestId('everyone-mention')).toBeInTheDocument();
    expect(getByTestId('custom-emoji')).toHaveAttribute('src', 'https://x/party.png');
    expect(container.textContent).toContain(':gone:');
    expect(container.textContent?.endsWith('〈')).toBe(true);
  });

  it('renders the same emoji twice in a row: no regex state leaks between calls', () => {
    const text = 'a 〈EMOJI:party〉 b';
    for (let i = 0; i < 3; i += 1) {
      const { getAllByTestId, unmount } = render(<>{renderWithMentions(text, mentions, emojis)}</>);
      expect(getAllByTestId('custom-emoji')).toHaveLength(1);
      unmount();
    }
  });
});

describe('processChildren', () => {
  it('passes plain children through untouched', () => {
    expect(processChildren('plain', mentions, emojis)).toBe('plain');
    const node = <b>x</b>;
    expect(processChildren(node, mentions, emojis)).toBe(node);
  });

  it('expands placeholders inside an array of children', () => {
    const { getByTestId } = render(<>{processChildren(['x ', '〈EMOJI:party〉'], mentions, emojis)}</>);
    expect(getByTestId('custom-emoji')).toBeInTheDocument();
  });
});
