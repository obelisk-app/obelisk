import { act, renderHook, waitFor } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

vi.mock('@/hooks/preferences/usePreferences', () => ({ usePreferences: () => ({ socialRelays: ['wss://a.example'] }) }));

import { useFollowButton } from '@/hooks/social/viewer/useFollowButton';

const ME = 'b'.repeat(64);
const THEM = 'a'.repeat(64);
const publishEvent = vi.fn();
const contacts = (tags: string[][]): NostrEvent => ({ id: 'c', pubkey: ME, kind: 3, created_at: 10, content: '', tags, sig: '' });
const click = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> };

function setup(seed: { myPubkey?: string | null; myContactList?: NostrEvent | null; myContactListReady?: boolean }) {
  const bridge = fakeBridge({ myPubkey: ME, myContactList: null, myContactListReady: true, ...seed }, { publishEvent });
  return renderHook(() => useFollowButton(THEM), { wrapper: bridgeWrapper(bridge) });
}

beforeEach(() => {
  vi.clearAllMocks();
  publishEvent.mockResolvedValue(undefined);
});

describe('useFollowButton', () => {
  it('hides the button with nobody signed in, and on your own key', () => {
    expect(setup({ myPubkey: null }).result.current.hidden).toBe(true);
    const own = fakeBridge({ myPubkey: THEM }, { publishEvent });
    expect(renderHook(() => useFollowButton(THEM), { wrapper: bridgeWrapper(own) }).result.current.hidden).toBe(true);
  });

  it('reads whether they are already followed and labels the button so', () => {
    const { result } = setup({ myContactList: contacts([['p', THEM]]) });
    expect(result.current.following).toBe(true);
    expect(result.current.labelKey).toBe('social.viewer.following');
  });

  it('a click stays out of the profile link and publishes the list with them added', async () => {
    const { result } = setup({ myContactList: contacts([['p', 'c'.repeat(64)]]) });
    const event = click();
    act(() => result.current.onClick(event));
    expect(event.preventDefault).toHaveBeenCalled();
    await waitFor(() => expect(publishEvent).toHaveBeenCalled());
    const [published, opts] = publishEvent.mock.calls[0];
    expect(published.kind).toBe(3);
    expect(published.tags.map((t: string[]) => t[1])).toEqual(['c'.repeat(64), THEM]);
    expect(published.created_at).toBeGreaterThan(10);
    expect(opts).toEqual({ extraRelays: ['wss://a.example'], mode: 'replace' });
  });

  it('does nothing until the contact list has loaded, so it never replaces it with one entry', () => {
    const { result } = setup({ myContactListReady: false });
    expect(result.current.disabled).toBe(true);
    act(() => result.current.onClick(click()));
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('offers a retry when publishing fails', async () => {
    publishEvent.mockRejectedValue(new Error('no relay'));
    const { result } = setup({});
    act(() => result.current.onClick(click()));
    await waitFor(() => expect(result.current.labelKey).toBe('social.viewer.retry'));
    expect(result.current.busy).toBe(false);
  });
});
