import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { nip19 } from 'nostr-tools';

const mocks = vi.hoisted(() => ({ push: vi.fn(), props: [] as Array<Record<string, unknown>> }));

vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/chat/profile/NostrProfile', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.props.push(props);
    return <div data-testid="profile" data-mobile={String(props.mobile)} />;
  },
}));

import ProfileViewerClient from '@/app/[locale]/p/[id]/ProfileViewerClient';

const PK = 'c'.repeat(64);
let listeners: Array<() => void>;
let matches: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.props.length = 0;
  listeners = [];
  matches = false;
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    get matches() { return matches; },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => { listeners = listeners.filter((l) => l !== cb); },
  })));
});

afterEach(() => vi.unstubAllGlobals());

describe('the public profile body', () => {
  it('is the app\'s own profile, seeded with the server\'s kind 0', () => {
    render(<ProfileViewerClient pubkey={PK} initialMeta={{ name: 'carol' }} />);
    const props = mocks.props.at(-1)!;
    expect(props.pubkey).toBe(PK);
    expect(props.initialMeta).toEqual({ name: 'carol' });
  });

  it('follows the phone breakpoint at 767px, and stops listening on unmount', () => {
    const { getByTestId, unmount } = render(<ProfileViewerClient pubkey={PK} initialMeta={{}} />);
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 767px)');
    expect(getByTestId('profile')).toHaveAttribute('data-mobile', 'false');
    act(() => {
      matches = true;
      listeners.forEach((l) => l());
    });
    expect(getByTestId('profile')).toHaveAttribute('data-mobile', 'true');
    unmount();
    expect(listeners).toHaveLength(0);
  });

  it('closes to the app and opens another person on their own public page', () => {
    render(<ProfileViewerClient pubkey={PK} initialMeta={{}} />);
    const props = mocks.props.at(-1)! as { onClose: () => void; onOpenProfile: (pubkey: string) => void };
    props.onClose();
    expect(mocks.push).toHaveBeenCalledWith('/app');
    props.onOpenProfile('d'.repeat(64));
    expect(mocks.push).toHaveBeenCalledWith(`/p/${nip19.npubEncode('d'.repeat(64))}`);
  });
});
