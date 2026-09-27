/**
 * The three host components of Obelisk Apps. The frame tests exercise the
 * security-relevant paths: the sandbox attributes, booting only for a hello
 * from THIS iframe, and tearing the frame down when the app navigates it.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Event as NostrEvent } from 'nostr-tools';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aggregateHash, parseManifest, type AppManifest } from '@/lib/apps/manifest';
import { buildSessionCreate } from '@/lib/apps/session';
import { AUTHOR, B, CH, ev, HOST, manifestEvent, PATHS, sessionEvent } from '@/lib/apps/test-helpers';
import { useAppsStore } from '@/store/apps';

const mocks = vi.hoisted(() => ({
  catalog: [] as AppManifest[],
  me: 'a'.repeat(64) as string | null,
  publishCreate: vi.fn(),
  loadPathBlob: vi.fn(),
}));

vi.mock('@/lib/nostr-bridge', () => ({
  useMyPubkey: () => mocks.me,
  useConnectionState: () => 'Connected',
  useGroups: () => [{ id: 'channel-1', name: 'general' }],
}));
vi.mock('@/lib/social/useAuthor', () => ({
  useAuthor: (pk: string) => ({ displayName: pk === 'f'.repeat(64) ? 'Obelisk Apps' : null, name: null, picture: null, nip05: null }),
}));
vi.mock('@/i18n/context', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'en' }) }));
vi.mock('@/lib/apps/catalog', () => ({
  subscribeCatalog: async (fn: (a: AppManifest[]) => void) => { fn(mocks.catalog); return () => {}; },
  catalogApp: (address: string) => mocks.catalog.find((m) => m.address === address) ?? null,
}));
vi.mock('@/lib/apps/transport', () => ({
  publishSessionCreate: (...a: unknown[]) => mocks.publishCreate(...a),
  publishSessionEvent: vi.fn(),
}));
vi.mock('@/lib/apps/bundle', () => ({ loadPathBlob: (...a: unknown[]) => mocks.loadPathBlob(...a) }));
vi.mock('@/lib/apps/resolve', () => ({ requestSessionLoad: vi.fn() }));
vi.mock('@/lib/apps/people', () => ({
  resolvePeople: async (pks: string[]) => pks.map((pubkey) => ({ pubkey, name: 'someone' })),
  resolvePerson: async (pubkey: string) => ({ pubkey, name: 'someone' }),
}));

import AppCard from './AppCard';
import AppIcon from './AppIcon';
import AppFrameModal from './AppFrameModal';
import AppPicker from './AppPicker';

const SESSION = '5'.repeat(64);
const manifest = parseManifest(manifestEvent())!;

function seedSession(extra: NostrEvent[] = []) {
  const t = buildSessionCreate(CH, { ...manifest, aggregate: aggregateHash(PATHS) }, 'n');
  useAppsStore.getState().ingestMany([ev(HOST, Math.floor(Date.now() / 1000), t.kind, t.tags, t.content, SESSION), ...extra]);
}

beforeEach(() => {
  useAppsStore.getState().reset();
  mocks.catalog = [manifest];
  mocks.me = HOST;
  mocks.publishCreate.mockReset();
  mocks.loadPathBlob.mockReset();
});

describe('AppCard', () => {
  it('shows a skeleton until the session arrives', () => {
    render(<AppCard sessionId={SESSION} />);
    expect(screen.getByTestId('app-card-loading')).toBeInTheDocument();
  });

  it('names the app from the catalog and shows the app\'s own status line', async () => {
    seedSession([sessionEvent(HOST, Math.floor(Date.now() / 1000) + 1, 'status', SESSION, { text: 'Bruno to move' })]);
    render(<AppCard sessionId={SESSION} />);
    await waitFor(() => expect(screen.getByTestId('app-card-title')).toHaveTextContent('Chain Reaction'));
    expect(screen.getByTestId('app-card-status')).toHaveTextContent('Bruno to move');
  });

  it('offers Join to someone not in it, Open to someone who is, and opens the frame', async () => {
    seedSession();
    mocks.me = B;
    const { unmount } = render(<AppCard sessionId={SESSION} />);
    await waitFor(() => expect(screen.getByTestId('app-card')).toHaveTextContent('apps.cardJoin'));
    unmount();
    mocks.me = HOST;
    render(<AppCard sessionId={SESSION} />);
    fireEvent.click(screen.getByTestId('app-card'));
    expect(useAppsStore.getState().openSessionId).toBe(SESSION);
  });
});

describe('AppPicker', () => {
  it('lists the relay\'s apps with their author, and filters /play to games', async () => {
    const tool = parseManifest(manifestEvent({ drop: ['d', 't', 'title'], tags: [['d', 'poll'], ['t', 'tool'], ['title', 'Poll']] }))!;
    mocks.catalog = [manifest, tool];
    render(<AppPicker channelId={CH} filter="game" onClose={vi.fn()} onPostMarker={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('app-option-chain-reaction')).toBeInTheDocument());
    expect(screen.getByTestId('app-option-chain-reaction')).toHaveTextContent('Obelisk Apps');
    expect(screen.queryByTestId('app-option-poll')).not.toBeInTheDocument();
  });

  it('creates a pinned session, posts the marker and opens it', async () => {
    mocks.publishCreate.mockResolvedValue(SESSION);
    const onPostMarker = vi.fn();
    const onClose = vi.fn();
    render(<AppPicker channelId={CH} onClose={onClose} onPostMarker={onPostMarker} />);
    await waitFor(() => screen.getByTestId('app-option-chain-reaction'));
    fireEvent.click(screen.getByTestId('app-option-chain-reaction'));
    await waitFor(() => expect(onPostMarker).toHaveBeenCalledWith(`[[app:${SESSION}]]`));
    expect(mocks.publishCreate).toHaveBeenCalledWith(CH, manifest);
    expect(useAppsStore.getState().openSessionId).toBe(SESSION);
    expect(onClose).toHaveBeenCalled();
  });

  it('says so when the relay carries nothing', async () => {
    mocks.catalog = [];
    render(<AppPicker channelId={CH} onClose={vi.fn()} onPostMarker={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('app-picker-empty')).toBeInTheDocument());
  });
});

describe('AppFrameModal', () => {
  it('draws the author label outside the frame and sandboxes the iframe', async () => {
    seedSession();
    mocks.loadPathBlob.mockResolvedValue(new Blob(['export default () => {}']));
    render(<AppFrameModal sessionId={SESSION} onClose={vi.fn()} />);
    const frame = await screen.findByTestId('app-frame');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('allow')).toBe('');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(screen.getByTestId('app-frame-author')).toHaveTextContent('Obelisk Apps');
    expect(screen.getByTestId('app-frame-author')).toHaveTextContent('apps.thirdPartyApp');
  });

  it('boots only on a hello from its own iframe, handing over the verified entry and a port', async () => {
    seedSession();
    const entry = new Blob(['export default () => {}']);
    mocks.loadPathBlob.mockResolvedValue(entry);
    render(<AppFrameModal sessionId={SESSION} onClose={vi.fn()} />);
    const frame = (await screen.findByTestId('app-frame')) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');

    // A hello from some other window is ignored.
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { obelisk: 1, type: 'hello' }, source: window }));
    });
    expect(post).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { obelisk: 1, type: 'hello' }, source: frame.contentWindow }));
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [msg, target, transfer] = post.mock.calls[0] as unknown as [{ type: string; entry: Blob }, string, MessagePort[]];
    expect(msg).toMatchObject({ obelisk: 1, type: 'boot' });
    expect(msg.entry).toBe(entry);
    expect(target).toBe('*');
    expect(transfer[0]).toBeInstanceOf(MessagePort);
    expect(mocks.loadPathBlob).toHaveBeenCalledWith(PATHS[0], expect.any(Array));
  });

  it('boots with the identity known at hello time, not the one from the first render', async () => {
    // The bug: the pubkey was captured on the first render, before the
    // identity hook answered, so the app saw a signed-out spectator and showed
    // the host no Start / Join / Cancel.
    seedSession();
    mocks.me = null;
    mocks.loadPathBlob.mockResolvedValue(new Blob(['x']));
    const { rerender } = render(<AppFrameModal sessionId={SESSION} onClose={vi.fn()} />);
    mocks.me = HOST;
    rerender(<AppFrameModal sessionId={SESSION} onClose={vi.fn()} />);
    const frame = (await screen.findByTestId('app-frame')) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { obelisk: 1, type: 'hello' }, source: frame.contentWindow }));
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const port = (post.mock.calls[0] as unknown as [unknown, string, MessagePort[]])[2][0];
    const init = await new Promise<Record<string, unknown>>((resolve) => {
      port.onmessage = (e) => { if (e.data?.type === 'init') resolve(e.data); };
      port.start();
    });
    expect(init.me).toBe(HOST);
  });

  it('tears the frame down when the app navigates it away', async () => {
    seedSession();
    mocks.loadPathBlob.mockResolvedValue(new Blob(['x']));
    render(<AppFrameModal sessionId={SESSION} onClose={vi.fn()} />);
    const frame = await screen.findByTestId('app-frame');
    await act(async () => {
      frame.dispatchEvent(new Event('load'));
      frame.dispatchEvent(new Event('load'));
    });
    await waitFor(() => expect(screen.getByTestId('app-frame-error')).toHaveTextContent('apps.errorNavigated'));
    expect(screen.queryByTestId('app-frame')).not.toBeInTheDocument();
  });

  it('refuses to run a legacy table when the official app is not on this relay', async () => {
    mocks.catalog = [];
    const legacy = ev(HOST, Math.floor(Date.now() / 1000), 2390,
      [['h', CH], ['t', 'obelisk-game'], ['op', 'create'], ['game', 'vesta']], '{"game":"vesta"}', SESSION);
    useAppsStore.getState().ingestMany([legacy]);
    render(<AppFrameModal sessionId={SESSION} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('app-frame-error')).toHaveTextContent('apps.errorLegacy'));
    expect(screen.queryByTestId('app-frame')).not.toBeInTheDocument();
  });

  it('never exposes the relay-fixed author key as a raw label', async () => {
    seedSession();
    mocks.loadPathBlob.mockResolvedValue(new Blob(['x']));
    render(<AppFrameModal sessionId={SESSION} onClose={vi.fn()} />);
    await screen.findByTestId('app-frame');
    expect(screen.getByTestId('app-frame-author').textContent).not.toContain(AUTHOR);
  });
});

describe('AppIcon', () => {
  const withIcon = parseManifest(manifestEvent())!; // icon: '/music/a.mp3', a pinned path

  it('shows the verified icon file as an image', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' });
    mocks.loadPathBlob.mockResolvedValue(svg);
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:icon');
    render(<AppIcon manifest={withIcon} />);
    const img = await screen.findByTestId('app-icon-image');
    expect(img.getAttribute('src')).toBe('blob:icon');
    expect(mocks.loadPathBlob).toHaveBeenCalledWith({ path: '/music/a.mp3', sha256: PATHS[1].sha256 }, expect.any(Array));
    created.mockRestore();
  });

  it('refuses a file that is not an image and keeps the generic mark', async () => {
    mocks.loadPathBlob.mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
    render(<AppIcon manifest={withIcon} />);
    await waitFor(() => expect(mocks.loadPathBlob).toHaveBeenCalled());
    expect(screen.getByTestId('app-icon-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('app-icon-image')).not.toBeInTheDocument();
  });

  it('shows the generic mark when the app declares no icon', () => {
    render(<AppIcon manifest={parseManifest(manifestEvent({ drop: ['icon'] }))!} />);
    expect(screen.getByTestId('app-icon-fallback')).toBeInTheDocument();
    expect(mocks.loadPathBlob).not.toHaveBeenCalled();
  });
});
