import { describe, expect, it } from 'vitest';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { PlaceholderText } from '@/components/chat/message/PlaceholderText';
import { MarkdownInline } from '@/components/chat/message/MarkdownInline';
import { EVERYONE_PLACEHOLDER } from '@/utils/message-text/markdown';

const mentions = new Map([['0', { pubkey: 'a'.repeat(64), displayName: 'Alice' }]]);
const emojis = { party: 'https://x/party.png' };
const show = (ui: React.ReactElement) => renderWithBridge(ui, fakeBridge());

describe('PlaceholderText', () => {
  it('swaps every placeholder kind in one pass', () => {
    const text = `hi 〈MENTION:0〉 ${EVERYONE_PLACEHOLDER} 〈EMOJI:party〉 〈EMOJI:gone〉 〈`;
    const { container, getByTestId } = show(<PlaceholderText text={text} mentions={mentions} emojis={emojis} />);
    expect(getByTestId('mention-highlight')).toHaveTextContent('@Alice');
    expect(getByTestId('everyone-mention')).toBeInTheDocument();
    expect(getByTestId('custom-emoji')).toHaveAttribute('src', 'https://x/party.png');
    expect(container.textContent).toContain(':gone:');
    expect(container.textContent?.endsWith('〈')).toBe(true);
  });

  it('renders the same emoji twice in a row: no regex state leaks between calls', () => {
    for (let i = 0; i < 3; i += 1) {
      const { getAllByTestId, unmount } = show(<PlaceholderText text="a 〈EMOJI:party〉 b" mentions={mentions} emojis={emojis} />);
      expect(getAllByTestId('custom-emoji')).toHaveLength(1);
      unmount();
    }
  });
});

describe('MarkdownInline', () => {
  it('passes plain children through untouched', () => {
    expect(show(<MarkdownInline mentions={mentions} emojis={emojis}>plain</MarkdownInline>).container.innerHTML).toBe('plain');
    expect(show(<MarkdownInline mentions={mentions} emojis={emojis}><b>x</b></MarkdownInline>).container.innerHTML).toBe('<b>x</b>');
  });

  it('expands a placeholder string in place', () => {
    const { container } = show(<MarkdownInline mentions={mentions} emojis={emojis}>{'x 〈EMOJI:party〉'}</MarkdownInline>);
    expect(container.querySelector('span')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('data-testid', 'custom-emoji');
  });

  it('expands placeholders inside an array of children, each such string in its own span', () => {
    const { container, getByTestId } = show(
      <MarkdownInline mentions={mentions} emojis={emojis}>{['x ', <b key="b">y</b>, '〈EMOJI:party〉']}</MarkdownInline>,
    );
    expect(getByTestId('custom-emoji')).toBeInTheDocument();
    expect(container.innerHTML).toMatch(/^x <b>y<\/b><span><img/);
  });
});
