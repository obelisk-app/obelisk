import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';
import { useChatStore } from '@/store/chat';
import type { JsGroup } from '@/lib/nostr-bridge';

const mockSearchMessages = vi.fn();

let mockGroups: JsGroup[] = [];

const g = (id: string, name: string): JsGroup => ({
  id, name, about: null, picture: null, banner: null,
  isPublic: true, isHidden: false, isRestricted: false, isOpen: true, parent: null, kind: 'text',
  forumTags: [], topics: [],
});

vi.mock('@/lib/nostr-bridge', () => ({
  nostrActions: {
    searchMessages: (...a: unknown[]) => mockSearchMessages(...a),
  },
  useGroups: () => mockGroups,
  useRelayPeople: () => [{ pubkey: 'a'.repeat(64), displayName: 'Alice', role: 'member' }],
  useCurrentRelayUrl: () => 'wss://relay.test',
  useMyPubkey: () => 'b'.repeat(64),
  // Unused by this screen but imported by the module.
  useIsLoggedIn: () => true,
  useIsRehydrating: () => false,
  useGroupById: () => null,
  useChildrenByParent: () => ({}),
  useMessages: () => [],
  useMessagesByGroup: () => ({}),
  useMessagesStatus: () => 'ready',
  useSignerReady: () => true,
  useMediaPacks: () => ({}),
  useMyFollows: () => [],
  useUserMetadata: () => null,
  useLoadEarlier: () => ({ loadEarlier: vi.fn(), loading: false, reachedStart: true }),
  useDirectMessages: () => ({}),
  useAdmins: () => [],
  useAdminsByGroup: () => ({}),
  useMembers: () => [],
  useMembersByGroup: () => ({}),
  useMembershipReady: () => true,
  useGroupCreators: () => ({}),
  useReactions: () => ({}),
  useConfiguredRelays: () => ['wss://relay.test'],
  useRelayAccess: () => ({ status: 'ok' }),
  useConnectionState: () => 'connected',
  useGroupMetadataEose: () => true,
  useActiveCallByChannel: () => ({}),
  getBridge: vi.fn(),
  getBridgeImpl: vi.fn(),
  getBridgeSync: vi.fn(),
}));

vi.mock('@/lib/hooks/useNostrUserSearch', () => ({
  useNostrUserSearch: () => ({ directHit: null, nip05Hit: null, nostrResults: [], loading: false }),
}));

vi.mock('@/lib/relay-info', () => ({
  faviconFor: (url: string) => `https://favicon/${url}`,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
  supportsSearch: () => true,
  SUGGESTED_RELAYS: [],
}));

vi.mock('@/lib/relay-branding', () => ({
  useRelayBranding: () => ({}),
  publishBranding: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/relay-emojis', () => ({
  useRelayEmojiSet: () => ({ title: '', emojis: [], updatedAt: 0 }),
  relayEmojiMap: () => ({}),
  publishRelayEmojiSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/channel-layout', () => ({
  useChannelLayout: () => ({ categories: [], channels: [], updatedAt: 0 }),
  useRelayOperatorPubkey: () => null,
  applyLayout: () => ({ categories: [], uncategorized: [] }),
  publishLayout: vi.fn().mockResolvedValue(undefined),
  newCategoryId: () => 'cat-test',
}));

vi.mock('@/components/BlossomImageInput', () => ({
  default: () => <div />,
  ChannelAppearanceInput: () => <div />,
}));

vi.mock('@/components/admin/RelayAdminPanel', () => ({ default: () => <div /> }));
vi.mock('@/components/admin/RelayEmojiAdminModal', () => ({ default: () => <div /> }));

import { SearchScreen } from './PhoneShell';

const hit = (id: string, content: string) => ({
  id, pubkey: 'f'.repeat(64), content, createdAt: 1_700_000_000, kind: 9,
  replyToId: null, mentions: [], groupId: 'rly/abc',
});

const ok = (hits: unknown[]) => ({ hits, partial: false, relayFiltered: true });

function renderScreen(selectGroup = vi.fn()) {
  const back = vi.fn();
  render(
    <LocaleProvider initialLocale="en">
      <SearchScreen back={back} selectGroup={selectGroup} />
    </LocaleProvider>,
  );
  return { back, selectGroup, input: screen.getByLabelText(/Search messages/) };
}

async function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockSearchMessages.mockReset().mockResolvedValue(ok([]));
  mockGroups = [g('rly/abc', 'General'), g('rly/btc', 'Bitcoin')];
  useChatStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mobile SearchScreen', () => {
  it('searches messages, not just channel names', async () => {
    // Regression: this screen used to issue zero relay queries while its
    // placeholder promised message and people search.
    mockSearchMessages.mockResolvedValue(ok([hit('m1', 'HELLO FROM A MESSAGE')]));
    const { input } = renderScreen();
    await type(input, 'hello');

    expect(mockSearchMessages).toHaveBeenCalled();
    expect(await screen.findByText('HELLO FROM A MESSAGE')).toBeTruthy();
  });

  it('sends multi-word queries as separate terms', async () => {
    const { input } = renderScreen();
    await type(input, 'hola mundo');
    expect(mockSearchMessages).toHaveBeenCalledWith(expect.objectContaining({
      terms: [{ text: 'hola', phrase: false }, { text: 'mundo', phrase: false }],
    }));
  });

  it('filter chips insert real grammar instead of setting a dead flag', async () => {
    const { input } = renderScreen();
    fireEvent.click(screen.getByTestId('mobile-search-chip-has'));
    expect((input as HTMLInputElement).value).toBe('has:image');
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mockSearchMessages).toHaveBeenCalledWith(expect.objectContaining({ has: ['image'] }));
  });

  it('resolves in: by channel name', async () => {
    const { input } = renderScreen();
    await type(input, 'in:General hello');
    expect(mockSearchMessages).toHaveBeenCalledWith(expect.objectContaining({
      groupIds: ['rly/abc'],
    }));
  });

  it('shows a no-matches state instead of a blank body', async () => {
    const { input } = renderScreen();
    await type(input, 'zzzznothing');
    await waitFor(() => expect(screen.getByTestId('mobile-search-no-matches')).toBeTruthy());
  });

  it('surfaces a search error', async () => {
    mockSearchMessages.mockRejectedValue(new Error('Search timed out. Try again.'));
    const { input } = renderScreen();
    await type(input, 'boom');
    await waitFor(() => expect(screen.getByTestId('mobile-search-error').textContent)
      .toContain('Search timed out'));
  });

  it('reports an unresolvable token', async () => {
    const { input } = renderScreen();
    await type(input, 'from:nobody');
    expect(screen.getByTestId('mobile-search-unresolved').textContent).toContain('from:nobody');
  });

  it('tapping a message result opens its channel and requests a jump', async () => {
    mockSearchMessages.mockResolvedValue(ok([hit('m1', 'JUMP HERE')]));
    const selectGroup = vi.fn();
    const { input } = renderScreen(selectGroup);
    await type(input, 'jump');

    fireEvent.click(await screen.findByTestId('mobile-search-message-row'));
    expect(selectGroup).toHaveBeenCalledWith('rly/abc', 'text');
    expect(useChatStore.getState().pendingJump).toEqual({ groupId: 'rly/abc', messageId: 'm1' });
  });

  it('matches channels on about/id too, not just name', async () => {
    mockGroups = [{ ...g('rly/xyz', 'Random'), about: 'all about bitcoin' }];
    const { input } = renderScreen();
    await type(input, 'bitcoin');
    expect(screen.getByText('Random')).toBeTruthy();
  });

  it('does not truncate the channel list at 30 silently', async () => {
    mockGroups = Array.from({ length: 40 }, (_, i) => g(`rly/${i}`, `chan-${i}`));
    renderScreen();
    expect(screen.getAllByText(/^chan-/)).toHaveLength(40);
  });
});
