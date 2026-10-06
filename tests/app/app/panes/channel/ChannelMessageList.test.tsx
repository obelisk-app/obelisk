import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { memo } from 'react';
import type { JsMessage, JsReaction } from '@/services/nostr-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { LocaleProvider } from '@/i18n/context';

// Count renders of the memoized row: the list must hand it identity-stable
// props, or every keystroke in the composer re-renders every visible message.
const rowRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/app/app/panes/MessageRow', () => ({
  MessageRow: memo(function MessageRow({ msg }: { msg: JsMessage }) {
    rowRenders.count += 1;
    return <div data-testid={`row-${msg.id}`} />;
  }),
}));

import { ChannelMessageList } from '@/app/app/panes/channel/ChannelMessageList';

const messages = [
  { id: 'm1', pubkey: 'a', content: 'hi', createdAt: 100, kind: 9, replyToId: null, mentions: [] },
  { id: 'm2', pubkey: 'a', content: 'again', createdAt: 120, kind: 9, replyToId: 'm1', mentions: [] },
] as unknown as JsMessage[];
const messagesById = new Map(messages.map((m) => [m.id, m] as const));
const zapTotals = new Map();
const onReply = () => {};

function list(reactions: Record<string, ReadonlyArray<JsReaction>>) {
  return (
    <ChannelMessageList
      groupId="g"
      group={groupFixture({ id: 'g', name: 'general', kind: 'text' })}
      messages={messages}
      messagesById={messagesById}
      reactions={reactions}
      zapTotals={zapTotals}
      isAdmin={false}
      onReply={onReply}
      emptyStage="welcome"
    />
  );
}

describe('ChannelMessageList', () => {
  it('does not re-render rows when the parent re-renders with a fresh, still-empty reactions map', () => {
    rowRenders.count = 0;
    const { rerender, getByTestId } = render(list({}));
    expect(getByTestId('row-m2')).toBeTruthy();
    expect(rowRenders.count).toBe(2);
    rerender(list({}));
    expect(rowRenders.count).toBe(2);
  });

  it('shows the empty state instead of rows when there are no messages', () => {
    const { queryByTestId, getByTestId } = render(
      <LocaleProvider><ChannelMessageList
        groupId="g"
        group={null}
        messages={[]}
        messagesById={new Map()}
        reactions={{}}
        zapTotals={zapTotals}
        isAdmin={false}
        onReply={onReply}
        emptyStage="loading-info"
      /></LocaleProvider>,
    );
    expect(queryByTestId('row-m1')).toBeNull();
    expect(getByTestId('messages-loading').getAttribute('data-stage')).toBe('channel-info');
  });
});
