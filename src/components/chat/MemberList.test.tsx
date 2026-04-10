import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MemberList from './MemberList';
import { useChatStore } from '@/store/chat';

const emptyProfileCache = new Map<string, { name?: string; picture?: string }>();

describe('MemberList presence indicator', () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
    useChatStore.getState().setMemberList([
      { pubkey: 'pk-online', displayName: 'Alice' },
      { pubkey: 'pk-offline', displayName: 'Bob' },
    ]);
  });

  it('renders online members with a green dot and offline members with a muted dot', () => {
    useChatStore.getState().setOnlinePubkeys(['pk-online']);

    render(<MemberList profileCache={emptyProfileCache} />);

    const online = screen.getAllByTitle('Online');
    const offline = screen.getAllByTitle('Offline');
    expect(online).toHaveLength(1);
    expect(offline).toHaveLength(1);
    expect(online[0].className).toContain('bg-lc-green');
    expect(offline[0].className).toContain('bg-lc-muted');
  });

  it('defaults every member to offline when onlinePubkeys is empty', () => {
    render(<MemberList profileCache={emptyProfileCache} />);
    expect(screen.queryAllByTitle('Online')).toHaveLength(0);
    expect(screen.getAllByTitle('Offline')).toHaveLength(2);
  });

  it('updates live when setPresence toggles a pubkey', () => {
    const { rerender } = render(<MemberList profileCache={emptyProfileCache} />);
    expect(screen.queryAllByTitle('Online')).toHaveLength(0);

    useChatStore.getState().setPresence('pk-online', true);
    rerender(<MemberList profileCache={emptyProfileCache} />);
    expect(screen.getAllByTitle('Online')).toHaveLength(1);

    useChatStore.getState().setPresence('pk-online', false);
    rerender(<MemberList profileCache={emptyProfileCache} />);
    expect(screen.queryAllByTitle('Online')).toHaveLength(0);
  });

  it('shows count as online/total', () => {
    useChatStore.getState().setOnlinePubkeys(['pk-online']);
    render(<MemberList profileCache={emptyProfileCache} />);
    expect(screen.getByText(/1\/2 online/i)).toBeInTheDocument();
  });
});
