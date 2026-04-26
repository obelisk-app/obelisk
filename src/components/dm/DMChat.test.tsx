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
  subscribeLiveMock: vi.fn(() => () => {}),
  decryptMock: vi.fn(),
  giftUnwrapMock: vi.fn(),
  cachedEventsByAccount: new Map<string, any[]>(),
  secretsByAccount: new Map<string, Map<string, string>>(),
  putSecretCalls: [] as Array<{ pubkey: string; eventId: string; plaintext: string }>,
}));

vi.mock('@/lib/dm/dm', () => ({
  sendDM: (args: any) => hoisted.sendDMMock(args),
  loadHistory: (...args: any[]) => hoisted.loadHistoryMock(...args),
  subscribeLive: (opts: any) => hoisted.subscribeLiveMock(opts),
  detectNip04InRecent: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/dm/follows', () => ({
  hydrateFollows: vi.fn(),
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
}));

vi.mock('@/lib/nostr', () => ({
  formatPubkey: (pk: string) => pk.slice(0, 8) + '...',
  getNDK: () => ({
    signer: { user: async () => ({ pubkey: 'my-pubkey' }) },
    pool: { relays: new Map([['wss://r1', {}]]) },
  }),
  connectNDK: vi.fn(),
}));

vi.mock('@nostr-dev-kit/ndk', () => ({
  NDKEvent: class FakeNDKEvent {
    id: string; kind: number; pubkey: string; content: string; tags: string[][]; created_at: number; sig: string;
    constructor(_ndk: unknown, raw?: any) {
      this.id = raw?.id ?? '';
      this.kind = raw?.kind ?? 0;
      this.pubkey = raw?.pubkey ?? '';
      this.content = raw?.content ?? '';
      this.tags = raw?.tags ?? [];
      this.created_at = raw?.created_at ?? 0;
      this.sig = raw?.sig ?? '';
    }
    async decrypt(...args: unknown[]) { return hoisted.decryptMock(this, ...args); }
  },
  NDKUser: class FakeNDKUser { pubkey: string; ndk: unknown; constructor({ pubkey }: { pubkey: string }) { this.pubkey = pubkey; } },
  giftWrap: vi.fn(),
  giftUnwrap: (...args: unknown[]) => hoisted.giftUnwrapMock(...args),
}));

const sendDMMock = hoisted.sendDMMock;
const loadHistoryMock = hoisted.loadHistoryMock;
const decryptMock = hoisted.decryptMock;
const giftUnwrapMock = hoisted.giftUnwrapMock;
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
  decryptMock.mockReset();
  giftUnwrapMock.mockReset();
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

    // After resolve the store contains exactly one message with the real id
    await waitFor(() => {
      const msgs = useDMStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe('sent-1');
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
  it('decrypts only the last N (=50) cached events on mount, not the full history', async () => {
    // 100 NIP-04 events between us and the partner. Pre-populate the secrets
    // cache so no signer fallback is needed; we want to assert the loop bound.
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
      expect(msgs.length).toBe(50);
    });

    const msgs = useDMStore.getState().messages;
    // Should be the NEWEST 50 — events 50..99, sorted ascending by createdAt.
    expect(msgs[0].content).toBe('plain-50');
    expect(msgs[49].content).toBe('plain-99');

    // The signer-fallback decrypt must NOT have been called — every secret was
    // a cache hit.
    expect(decryptMock).not.toHaveBeenCalled();
    expect(giftUnwrapMock).not.toHaveBeenCalled();
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
    // No secret pre-seeded → cache miss → signer fallback.
    decryptMock.mockImplementation(async (target: any) => {
      target.content = 'fresh-plaintext';
    });

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
