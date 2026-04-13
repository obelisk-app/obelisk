import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('MemberList role grouping', () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
  });

  it('groups online members by base role', () => {
    useChatStore.getState().setMemberList([
      { pubkey: 'pk-owner', displayName: 'Owner', role: 'owner' },
      { pubkey: 'pk-admin', displayName: 'Admin', role: 'admin' },
      { pubkey: 'pk-member', displayName: 'Member', role: 'member' },
    ]);
    useChatStore.getState().setOnlinePubkeys(['pk-owner', 'pk-admin', 'pk-member']);

    render(<MemberList profileCache={emptyProfileCache} />);

    expect(screen.getByText(/Owner — 1/)).toBeInTheDocument();
    expect(screen.getByText(/Admin — 1/)).toBeInTheDocument();
    expect(screen.getByText(/Member — 1/)).toBeInTheDocument();
  });

  it('groups by custom role when its priority exceeds base role', () => {
    useChatStore.getState().setMemberList([
      {
        pubkey: 'pk-vip',
        displayName: 'VIP User',
        role: 'member',
        customRoles: [{ id: 'r1', name: 'VIP', color: '#ff0000', priority: 500 }],
      },
      { pubkey: 'pk-normal', displayName: 'Normal', role: 'member' },
    ]);
    useChatStore.getState().setOnlinePubkeys(['pk-vip', 'pk-normal']);

    render(<MemberList profileCache={emptyProfileCache} />);

    expect(screen.getByText(/VIP — 1/)).toBeInTheDocument();
    expect(screen.getByText(/Member — 1/)).toBeInTheDocument();
  });

  it('places offline members in collapsible section', () => {
    useChatStore.getState().setMemberList([
      { pubkey: 'pk-online', displayName: 'Alice', role: 'member' },
      { pubkey: 'pk-offline', displayName: 'Bob', role: 'member' },
    ]);
    useChatStore.getState().setOnlinePubkeys(['pk-online']);

    render(<MemberList profileCache={emptyProfileCache} />);

    expect(screen.getByText(/Offline — 1/)).toBeInTheDocument();
    // Bob should be visible
    expect(screen.getByText('Bob')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByTestId('offline-toggle'));
    // Bob should be hidden
    const items = screen.getAllByTestId('member-item');
    // Only Alice should remain
    expect(items).toHaveLength(1);
  });

  it('renders custom role emoji icon next to member name', () => {
    useChatStore.getState().setMemberList([
      {
        pubkey: 'pk-star',
        displayName: 'Star User',
        role: 'member',
        customRoles: [{ id: 'r1', name: 'Stars', color: '#ffd700', icon: '⭐', priority: 500 }],
      },
    ]);
    useChatStore.getState().setOnlinePubkeys(['pk-star']);

    render(<MemberList profileCache={emptyProfileCache} />);

    expect(screen.getByText('⭐')).toBeInTheDocument();
  });

  it('renders custom role URL icon as img next to member name', () => {
    useChatStore.getState().setMemberList([
      {
        pubkey: 'pk-img',
        displayName: 'Img User',
        role: 'member',
        customRoles: [{ id: 'r2', name: 'Custom', color: '#00ff00', icon: '/uploads/icon.png', priority: 500 }],
      },
    ]);
    useChatStore.getState().setOnlinePubkeys(['pk-img']);

    render(<MemberList profileCache={emptyProfileCache} />);

    const item = screen.getByTestId('member-item');
    const img = item.querySelector('img[src="/uploads/icon.png"]');
    expect(img).toBeTruthy();
  });

  it('renders bots in a dedicated group with status text and no presence dot', () => {
    useChatStore.getState().setMemberList([
      { pubkey: 'bot:b1', displayName: 'BTC/USD', isBot: true, statusText: 'BTC $63,412' },
      { pubkey: 'pk-real', displayName: 'Alice', role: 'member' },
    ]);
    useChatStore.getState().setOnlinePubkeys(['pk-real']);

    render(<MemberList profileCache={emptyProfileCache} />);

    expect(screen.getByTestId('bots-group')).toBeInTheDocument();
    expect(screen.getByText(/Bots — 1/)).toBeInTheDocument();
    expect(screen.getByTestId('bot-status')).toHaveTextContent('BTC $63,412');
    // Header counts only human members
    expect(screen.getByText(/1\/1 online/i)).toBeInTheDocument();
    // Bot row should not have an Online/Offline badge
    const botItem = screen.getByTestId('bot-item');
    expect(botItem.querySelector('[title="Online"]')).toBeNull();
    expect(botItem.querySelector('[title="Offline"]')).toBeNull();
  });

  it('applyBotUpdate patches the bot row live', () => {
    useChatStore.getState().setMemberList([
      { pubkey: 'bot:b1', displayName: 'BTC/USD', isBot: true, statusText: null },
    ]);
    const { rerender } = render(<MemberList profileCache={emptyProfileCache} />);
    expect(screen.queryByTestId('bot-status')).toBeNull();

    useChatStore.getState().applyBotUpdate({
      serverId: 's1',
      id: 'b1',
      type: 'btc-usd',
      lastValue: 'BTC $1,000',
    });
    rerender(<MemberList profileCache={emptyProfileCache} />);
    expect(screen.getByTestId('bot-status')).toHaveTextContent('BTC $1,000');
  });

  it('colors username by highest-priority custom role', () => {
    useChatStore.getState().setMemberList([
      {
        pubkey: 'pk-gold',
        displayName: 'Gold User',
        role: 'member',
        customRoles: [{ id: 'r1', name: 'Gold', color: '#ffd700', priority: 500 }],
      },
    ]);
    useChatStore.getState().setOnlinePubkeys(['pk-gold']);

    render(<MemberList profileCache={emptyProfileCache} />);

    const nameEl = screen.getByText('Gold User');
    expect(nameEl.style.color).toBe('rgb(255, 215, 0)');
  });
});
