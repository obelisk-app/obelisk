import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JsDirectMessage } from '@/services/nostr-bridge';

vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: () => ({ name: 'alice', displayName: 'Alice', picture: 'a.png', nip05: null }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => () => 'Encrypted message · open chat to read' }));
const unread = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/hooks/read-state/useUnreadCounts', () => ({ useDMUnreadCount: () => unread.n }));

import { useDmListRow } from '@/hooks/shell/dm/useDmListRow';

const last = { id: '1', content: 'see  you', createdAt: 1, outgoing: true } as JsDirectMessage;

describe('useDmListRow', () => {
  it('names the peer from the merged profile and previews the last message', () => {
    unread.n = 0;
    const { result } = renderHook(() => useDmListRow('a'.repeat(64), last, 'You: '));
    expect(result.current).toEqual({ name: 'Alice', picture: 'a.png', preview: 'You: see you', unread: false, unreadLabel: '0' });
  });

  it('flags unread conversations with a capped count', () => {
    unread.n = 150;
    const { result } = renderHook(() => useDmListRow('a'.repeat(64), undefined, 'You: '));
    expect(result.current).toMatchObject({ unread: true, unreadLabel: '99+', preview: 'Encrypted message · open chat to read' });
  });
});
