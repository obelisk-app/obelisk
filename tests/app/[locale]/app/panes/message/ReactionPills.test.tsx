import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { ReactionPills } from '@/app/[locale]/app/panes/message/ReactionPills';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import type { MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import type { GroupedReaction } from '@/utils/message-text/emoji-shortcodes';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function pill(over: Partial<GroupedReaction> & { emoji: string }): GroupedReaction {
  return { customEmojis: {}, pubkeys: new Set([A]), reactionIds: ['r1'], myReactionId: null, count: 1, mine: false, ...over };
}

function actions(over: Partial<MessageRowActions> = {}): MessageRowActions {
  return {
    counts: [],
    myReactedEmojis: new Set<string>(),
    onReactionClick: vi.fn(),
    onZapClick: vi.fn(),
    isOwn: false,
    ...over,
  } as unknown as MessageRowActions;
}

function zaps(amounts: Array<[string, number]>): MessageZapTotal {
  const zapperAmounts = new Map(amounts);
  const totalSats = amounts.reduce((n, [, s]) => n + s, 0);
  return { totalSats, count: amounts.length, zappers: new Set(zapperAmounts.keys()), zapperAmounts };
}

function mount(a: MessageRowActions, zapTotal: MessageZapTotal | null = null, isAdmin = false) {
  const bridge = fakeBridge({
    userMetadata: { [A]: userMetadataFixture({ displayName: 'Ana' }), [B]: userMetadataFixture({ displayName: 'Bea' }) },
  });
  return renderWithBridge(<ReactionPills actions={a} zapTotal={zapTotal} isAdmin={isAdmin} />, bridge);
}

describe('ReactionPills', () => {
  it('renders nothing with no reactions and no zaps (or a zero zap total)', () => {
    const { container } = mount(actions(), zaps([]));
    expect(container.innerHTML).toBe('');
  });

  it('shows the zap total, its zappers largest first, and opens the zap flow', () => {
    const a = actions();
    mount(a, zaps([[A, 21], [B, 1000]]));
    const zap = screen.getByRole('button', { name: /1,021/ });
    fireEvent.click(zap);
    expect(a.onZapClick).toHaveBeenCalledTimes(1);
    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('1,021 sats · 2 zaps');
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Bea1,000', 'Ana21']);
  });

  it('disables the zap pill on your own message', () => {
    mount(actions({ isOwn: true }), zaps([[A, 5]]));
    expect(screen.getByRole('button', { name: /5/ })).toBeDisabled();
  });

  it('a pill shows the emoji and count, names who reacted, and reacts on click', () => {
    const a = actions({ counts: [pill({ emoji: '🔥', count: 2, pubkeys: new Set([A, B]), myReactionId: null })] });
    mount(a);
    const button = screen.getByTitle('React');
    expect(button.textContent).toBe('🔥2');
    fireEvent.click(button);
    expect(a.onReactionClick).toHaveBeenCalledWith('🔥', {}, null, undefined);
    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('🔥 2 reactions');
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ana', 'Bea']);
  });

  it('your own reaction is lit and a click retracts it', () => {
    const a = actions({
      counts: [pill({ emoji: '🔥', myReactionId: 'mine', mine: true })],
      myReactedEmojis: new Set(['🔥']),
    });
    mount(a);
    const button = screen.getByTitle('Remove your reaction');
    expect(button.className).toContain('border-lc-green/60');
    fireEvent.click(button);
    expect(a.onReactionClick).toHaveBeenCalledWith('🔥', {}, 'mine', undefined);
  });

  it('for an admin a click removes every reaction of that emoji', () => {
    const a = actions({ counts: [pill({ emoji: '👍', reactionIds: ['r1', 'r2'] })] });
    mount(a, null, true);
    const button = screen.getByTitle('Remove reactions for everyone');
    expect(button.className).toContain('border-lc-green/60');
    fireEvent.click(button);
    expect(a.onReactionClick).toHaveBeenCalledWith('👍', {}, null, ['r1', 'r2']);
  });

  it('renders a custom emoji as its image', () => {
    mount(actions({ counts: [pill({ emoji: ':party:', customEmojis: { party: 'https://x.test/p.png' } })] }));
    expect(screen.getByAltText(':party:').getAttribute('src')).toBe('https://x.test/p.png');
  });

  it('caps the reactor list at 20 names', () => {
    const many = Array.from({ length: 23 }, (_, i) => String(i).padStart(64, 'c'));
    mount(actions({ counts: [pill({ emoji: '🎉', count: 23, pubkeys: new Set(many) })] }));
    const card = screen.getByRole('tooltip');
    const items = within(card).getAllByRole('listitem');
    expect(items).toHaveLength(21);
    expect(items[20].textContent).toBe('...and 3 more');
  });
});
