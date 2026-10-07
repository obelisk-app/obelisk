import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const mocks = vi.hoisted(() => ({ shareOrCopyLink: vi.fn(), copyWithToast: vi.fn(), deleteNoteWithToast: vi.fn() }));
vi.mock('@/hooks/preferences/usePreferences', () => ({ usePreferences: () => ({ socialRelays: [] }) }));
vi.mock('@/services/social/share-link', () => ({ shareOrCopyLink: mocks.shareOrCopyLink }));
vi.mock('@/services/common/clipboard', () => ({ copyWithToast: mocks.copyWithToast }));
vi.mock('@/services/social/delete-note', () => ({ deleteNoteWithToast: mocks.deleteNoteWithToast }));

import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/feedback/toast';
import { useNoteMenu } from '@/hooks/social/note/useNoteMenu';

const NOTE: NostrEvent = { id: 'a'.repeat(64), pubkey: 'b'.repeat(64), kind: 1, content: 'hi', created_at: 1, sig: '', tags: [] };
const render = (onDeleted?: () => void) =>
  renderHook(() => useNoteMenu({ note: NOTE, onDeleted }), { wrapper: bridgeWrapper(fakeBridge()) });

beforeEach(() => {
  mocks.shareOrCopyLink.mockReset();
  mocks.copyWithToast.mockReset();
  mocks.deleteNoteWithToast.mockReset().mockResolvedValue(undefined);
  useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
  useToastStore.getState().clearToasts();
});

describe('useNoteMenu', () => {
  it('hands out the share link, the event id, the npub and the author page', () => {
    const { result } = render();
    expect(result.current.shareUrl).toContain('/notes/');
    expect(result.current.identifier).toMatch(/^nevent1|^note1/);
    expect(result.current.npub).toMatch(/^npub1/);
    expect(result.current.authorUrl).toContain('/p/');
    expect(result.current.groupUrl).toBeNull();
  });

  it('closes after a copy and a mute', () => {
    const { result } = render();
    act(() => result.current.toggle());
    act(() => result.current.copy('x', 'Copied'));
    expect(mocks.copyWithToast).toHaveBeenCalledWith('x', 'Copied');
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    act(() => result.current.mute());
    expect(result.current.muted).toBe(true);
    expect(result.current.open).toBe(false);
  });

  it('opens the raw view in place of the menu', () => {
    const { result } = render();
    act(() => result.current.toggle());
    act(() => result.current.openRaw());
    expect(result.current.rawOpen).toBe(true);
    expect(result.current.open).toBe(false);
    act(() => result.current.closeRaw());
    expect(result.current.rawOpen).toBe(false);
  });

  it('confirms a share only when it happened', async () => {
    mocks.shareOrCopyLink.mockResolvedValue(true);
    const { result } = render();
    act(() => result.current.share());
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(mocks.shareOrCopyLink).toHaveBeenCalledWith({ url: result.current.shareUrl });
  });

  it('closes, then deletes through the service', () => {
    const onDeleted = vi.fn();
    const { result } = render(onDeleted);
    act(() => result.current.toggle());
    act(() => result.current.remove());
    expect(result.current.open).toBe(false);
    expect(mocks.deleteNoteWithToast).toHaveBeenCalledWith(NOTE, expect.any(Function), onDeleted);
  });
});
