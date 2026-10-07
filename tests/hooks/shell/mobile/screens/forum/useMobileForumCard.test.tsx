import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useMobileForumCard } from '@/hooks/shell/mobile/screens/forum/useMobileForumCard';
import { group, message } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const TAGS = [{ id: 'news', name: 'News', emoji: null, color: null }];
const THREAD = group({ id: 't1', name: null, topics: ['news', 'news', 'gone'] });
const run = (seed: Parameters<typeof fakeBridge>[0]) =>
  renderHook(() => useMobileForumCard(THREAD, TAGS), { wrapper: bridgeWrapper(fakeBridge(seed)) }).result.current;

describe('useMobileForumCard', () => {
  it('is loading until the opening post arrives, and hidden once the relay confirms none', () => {
    expect(run({}).state).toBe('loading');
    expect(run({ messagesStatusByGroup: { t1: 'empty-confirmed' } }).state).toBe('hidden');
  });

  it('names the opening and the last poster and counts the messages', () => {
    const card = run({
      messagesByGroup: { t1: [message({ id: 'a', pubkey: 'b'.repeat(64), content: 'first' }), message({ id: 'b', pubkey: 'c'.repeat(64) })] },
      userMetadata: { ['b'.repeat(64)]: { name: 'Olga' } as never, ['c'.repeat(64)]: { name: 'Lars' } as never },
    });
    expect(card).toMatchObject({ state: 'ready', opName: 'Olga', lastName: 'Lars', messageCount: 2 });
    expect(card.op?.content).toBe('first');
  });

  it('keeps each known tag once and titles a nameless thread with its id', () => {
    const card = run({});
    expect(card.tags.map((t) => t.id)).toEqual(['news']);
    expect(card.title).toBe('t1');
    expect(card.initialsSeed).toBe('T1');
  });
});
