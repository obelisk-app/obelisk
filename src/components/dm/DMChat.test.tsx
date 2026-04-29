import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import DMChat from './DMChat';
import { DMSessionProvider } from './DMSessionProvider';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';

// vi.hoisted: factories run before top-level statements, so any closed-over
// state must live inside `hoisted` so the references resolve at hoist time.
const hoisted = vi.hoisted(() => ({
  sendDMMock: vi.fn(),
  loadHistoryMock: vi.fn(),
  subscribeLiveMock: vi.fn((_opts?: unknown) => () => {}),
  // signer.nip04Decrypt — the new code path on the cache miss.
  nip04DecryptMock: vi.fn(),
  unwrapGiftWrapMock: vi.fn(),
  cachedEventsByAccount: new Map<string, any[]>(),
  secretsByAccount: new Map<string, Map<string, string>>(),
  putSecretCalls: [] as Array<{ pubkey: string; eventId: string; plaintext: string }>,
}));

vi.mock('@/lib/dm/dm', () => ({
  sendDM: (args: any) => hoisted.sendDMMock(args),
  loadHistory: (...args: any[]) => hoisted.loadHistoryMock(...args),
  loadOlder: vi.fn(),
  subscribeLive: (opts: any) => hoisted.subscribeLiveMock(opts),
  detectNip04InRecent: vi.fn().mockReturnValue(false),
  // Pulled in transitively via DMSessionProvider — mock as resolved-empty
  // so the await chains in the provider settle without network access.
  fetchMyInboxRelays: vi.fn().mockResolvedValue([]),
  fetchMyDmRelays: vi.fn().mockResolvedValue([]),
  discoverNip17Partners: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/dm/follows', () => ({
  hydrateFollows: vi.fn(),
}));

// ProfileProvider is mounted by DMSessionProvider; in tests we don't want
// the real provider opening relay subscriptions to purplepag.es. Stub it
// to a passthrough and have `useProfile` always return null — header,
// bubble, and sidebar will render with the npub fallback, which is what
// existing tests assert.
vi.mock('@/components/ProfileProvider', () => ({
  ProfileProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useProfile: () => null,
  useProfileMap: () => ({}),
}));

// `subscribeProfile` is also imported indirectly via ProfileProvider —
// stub it just in case a code path lands there.
vi.mock('@/lib/dm/profile-cache', () => ({
  subscribeProfile: () => () => {},
  setProfileDynamicRelays: vi.fn(),
}));

vi.mock('@/lib/dm/cache-key', () => ({
  getOrCreateCacheKey: vi.fn().mockResolvedValue({} as CryptoKey),
}));

vi.mock('@/lib/dm/dm-cache', () => ({
  getCachedEvents: (pk: string) => hoisted.cachedEventsByAccount.get(pk) ?? [],
  getSecret: async (pk: string, _key: CryptoKey, eventId: string) =>
    hoisted.secretsByAccount.get(pk)?.get(eventId),
  putSecret: async (pk: string, _key: CryptoKey, eventId: string, plaintext: string) => {
    if (!hoisted.secretsByAccount.has(pk)) hoisted.secretsByAccount.set(pk, new Map());
    hoisted.secretsByAccount.get(pk)!.set(eventId, plaintext);
    hoisted.putSecretCalls.push({ pubkey: pk, eventId, plaintext });
  },
  subscribeToCacheTick: () => () => {},
}));

vi.mock('@/lib/nostr', () => ({
  formatPubkey: (pk: string) => pk.slice(0, 8) + '...',
  getSigner: () => ({
    getPublicKey: async () => 'my-pubkey',
    // The decrypt module calls signer.nip04Decrypt on cache miss.
    nip04Decrypt: (...args: unknown[]) => hoisted.nip04DecryptMock(...args),
    nip44Encrypt: vi.fn(),
    nip44Decrypt: vi.fn(),
  }),
  getExplicitRelays: () => ['wss://r1'],
  // Auth store subscribes to signer changes; mock returns a no-op unsub.
  onSignerChange: vi.fn(() => () => {}),
  setNDKSigner: vi.fn(),
}));

vi.mock('@nostr-wot/data/react', () => ({
  useKEKSigner: vi.fn(() => ({
    pubkey: 'my-pubkey',
    nip44Encrypt: vi.fn(),
    nip44Decrypt: vi.fn(),
  })),
}));

vi.mock('@nostr-wot/dm', () => ({
  unwrapGiftWrap: (...args: unknown[]) => hoisted.unwrapGiftWrapMock(...args),
  buildChatMessage: vi.fn(),
  sealAndGiftWrap: vi.fn(),
}));

const sendDMMock = hoisted.sendDMMock;
const loadHistoryMock = hoisted.loadHistoryMock;
const nip04DecryptMock = hoisted.nip04DecryptMock;
const unwrapGiftWrapMock = hoisted.unwrapGiftWrapMock;
const cachedEventsByAccount = hoisted.cachedEventsByAccount;
const secretsByAccount = hoisted.secretsByAccount;
const putSecretCalls = hoisted.putSecretCalls;

const profileCache = new Map<string, { name?: string; picture?: string }>();
profileCache.set('sender-pk', { name: 'Alice', picture: 'https://example.com/alice.png' });

function renderWithSession(ui: React.ReactElement) {
  return render(<DMSessionProvider myPubkey="my-pubkey">{ui}</DMSessionProvider>);
}

beforeEach(() => {
  useDMStore.setState({
    isDMMode: false,
    activeDMPubkey: null,
    threads: [],
    messages: [],
    isLoadingMessages: false,
    isLoadingThreads: false,
    hasMoreHistory: false,
    protocolOverrides: {},
    showProtocolPrompt: null,
  });
  useAuthStore.setState({
    ...useAuthStore.getState(),
    profile: { pubkey: 'my-pubkey', displayName: 'Me' } as never,
  });
  cachedEventsByAccount.clear();
  secretsByAccount.clear();
  putSecretCalls.length = 0;
  sendDMMock.mockReset();
  sendDMMock.mockResolvedValue({ id: 'sent-1', created_at: 1700000000 });
  loadHistoryMock.mockReset();
  nip04DecryptMock.mockReset();
  unwrapGiftWrapMock.mockReset();
});

describe('DMChat', () => {
  it('renders empty state when no active DM', () => {
    renderWithSession(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('Select a conversation')).toBeInTheDocument();
  });

  it('renders skeleton loading state', () => {
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: true, messages: [] });
    const { container } = renderWithSession(<DMChat profileCache={profileCache} />);
    expect(container.querySelectorAll('.lc-skeleton-circle').length).toBeGreaterThan(0);
  });

  it('renders messages', () => {
    useDMStore.setState({
      activeDMPubkey: 'sender-pk',
      isLoadingMessages: false,
      messages: [
        { id: '1', senderPubkey: 'sender-pk', recipientPubkey: 'my-pubkey', content: 'Hello!', createdAt: 1700000000, protocol: 'nip17' },
        { id: '2', senderPubkey: 'my-pubkey', recipientPubkey: 'sender-pk', content: 'Hi back!', createdAt: 1700000060, protocol: 'nip17' },
      ],
    });
    renderWithSession(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.getByText('Hi back!')).toBeInTheDocument();
  });

  it('shows NIP-17 protocol indicator', () => {
    useDMStore.setState({ activeDMPubkey: 'sender-pk', messages: [] });
    renderWithSession(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('🔒 NIP-17')).toBeInTheDocument();
  });

  it('shows NIP-04 indicator when override set', () => {
    useDMStore.setState({
      activeDMPubkey: 'sender-pk',
      messages: [],
      protocolOverrides: { 'sender-pk': 'nip04' },
    });
    renderWithSession(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('⚠️ NIP-04')).toBeInTheDocument();
  });

  it('optimistically inserts a pending message, then replaces it on publish', async () => {
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: false, messages: [] });
    const user = userEvent.setup();
    renderWithSession(<DMChat profileCache={profileCache} />);

    const input = screen.getByTestId('dm-input');
    await user.type(input, 'Hello world');
    await user.keyboard('{Enter}');

    // sendDM is invoked through the session with the args object shape.
    await waitFor(() => {
      expect(sendDMMock).toHaveBeenCalledWith(
        expect.objectContaining({
          myPubkey: 'my-pubkey',
          recipientPubkey: 'sender-pk',
          content: 'Hello world',
          protocol: 'nip17',
        }),
      );
    });

    // After resolve the store contains exactly one message. For NIP-17 the
    // wrap event's id is ephemeral and doesn't match the rumor the recipient
    // eventually sees, so we keep the optimistic id (just clear isPending);
    // for NIP-04 the event IS the message and the real id replaces.
    await waitFor(() => {
      const msgs = useDMStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toMatch(/^pending-/);
      expect(msgs[0].content).toBe('Hello world');
      expect(msgs[0].isPending).toBeUndefined();
    });
  });

  it('marks optimistic message as failed and shows retry button on publish error', async () => {
    sendDMMock.mockRejectedValueOnce(new Error('no relay'));
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: false, messages: [] });
    const user = userEvent.setup();
    renderWithSession(<DMChat profileCache={profileCache} />);

    const input = screen.getByTestId('dm-input');
    await user.type(input, 'broken');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('dm-retry')).toBeInTheDocument();
    });
    const msgs = useDMStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].sendError).toBe('no relay');
  });

  it('shows empty message hint', () => {
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: false, messages: [] });
    renderWithSession(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('No messages yet. Say hello!')).toBeInTheDocument();
  });

  it('opens protocol prompt on send when thread has NIP-04 and no override', async () => {
    const { detectNip04InRecent } = await import('@/lib/dm/dm');
    (detectNip04InRecent as unknown as { mockReturnValueOnce: (v: boolean) => void }).mockReturnValueOnce(true);
    useDMStore.setState({
      activeDMPubkey: 'sender-pk',
      isLoadingMessages: false,
      messages: [
        { id: '1', senderPubkey: 'sender-pk', recipientPubkey: 'my-pubkey', content: 'legacy', createdAt: 1700000000, protocol: 'nip04' },
      ],
    });
    const user = userEvent.setup();
    renderWithSession(<DMChat profileCache={profileCache} />);

    const input = screen.getByTestId('dm-input');
    await user.type(input, 'reply');
    await user.keyboard('{Enter}');

    // Protocol prompt should be triggered and text restored to input
    expect(useDMStore.getState().showProtocolPrompt).toBe('sender-pk');
    expect((input as HTMLTextAreaElement).value).toBe('reply');
  });
});

describe('DMChat viewport decryption', () => {
  it('decrypts only the last N (=10) cached events per pass, not the full history', async () => {
    // 100 NIP-04 events between us and the partner. Pre-populate the secrets
    // cache so no signer fallback is needed; we want to assert the loop bound.
    // The provider's decryption pipeline batches at DECRYPT_BATCH=10 (small
    // on purpose so first paint is fast on cold-signer accounts) and
    // self-reschedules every 2s to backfill older events.
    const myPubkey = 'my-pubkey';
    const partner = 'sender-pk';
    const events: any[] = [];
    const secrets = new Map<string, string>();
    for (let i = 0; i < 100; i++) {
      const id = `ev-${i}`;
      events.push({
        id,
        pubkey: i % 2 === 0 ? partner : myPubkey,
        kind: 4,
        created_at: 1_700_000_000 + i, // older first, newest at the end
        content: `ciphertext-${i}`,
        tags: [['p', i % 2 === 0 ? myPubkey : partner]],
        sig: 'sig',
      });
      // Plaintext encoded as JSON envelope (the format the component uses).
      secrets.set(
        id,
        JSON.stringify({
          senderPubkey: i % 2 === 0 ? partner : myPubkey,
          recipientPubkey: i % 2 === 0 ? myPubkey : partner,
          content: `plain-${i}`,
          createdAt: 1_700_000_000 + i,
          protocol: 'nip04',
        }),
      );
    }
    cachedEventsByAccount.set(myPubkey, events);
    secretsByAccount.set(myPubkey, secrets);

    useDMStore.setState({ activeDMPubkey: partner, isLoadingMessages: false, messages: [] });
    renderWithSession(<DMChat profileCache={profileCache} />);

    // Wait until the viewport decryption populates the store.
    await waitFor(() => {
      const msgs = useDMStore.getState().messages;
      expect(msgs.length).toBe(10);
    });

    const msgs = useDMStore.getState().messages;
    // Should be the NEWEST 10 — events 90..99, sorted ascending by createdAt.
    expect(msgs[0].content).toBe('plain-90');
    expect(msgs[9].content).toBe('plain-99');

    // The signer-fallback decrypt must NOT have been called — every secret was
    // a cache hit.
    expect(nip04DecryptMock).not.toHaveBeenCalled();
    expect(unwrapGiftWrapMock).not.toHaveBeenCalled();
  });

  it('falls back to signer decrypt on cache miss and writes the plaintext back', async () => {
    const myPubkey = 'my-pubkey';
    const partner = 'sender-pk';
    const ev = {
      id: 'ev-fresh',
      pubkey: partner,
      kind: 4,
      created_at: 1_700_000_500,
      content: 'wire-ciphertext',
      tags: [['p', myPubkey]],
      sig: 'sig',
    };
    cachedEventsByAccount.set(myPubkey, [ev]);
    // No secret pre-seeded → cache miss → signer.nip04Decrypt fallback.
    nip04DecryptMock.mockImplementation(async () => 'fresh-plaintext');

    useDMStore.setState({ activeDMPubkey: partner, isLoadingMessages: false, messages: [] });
    renderWithSession(<DMChat profileCache={profileCache} />);

    await waitFor(() => {
      const msgs = useDMStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('fresh-plaintext');
    });

    // Plaintext must have been written into the secrets cache for next render.
    expect(putSecretCalls.find((c) => c.eventId === 'ev-fresh')).toBeTruthy();
  });
});
