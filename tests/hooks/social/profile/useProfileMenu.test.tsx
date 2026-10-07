import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const mocks = vi.hoisted(() => ({ shareOrCopyLink: vi.fn(), copyWithToast: vi.fn() }));
vi.mock('@/hooks/preferences/usePreferences', () => ({ usePreferences: () => ({ socialRelays: [] }) }));
vi.mock('@/services/social/share-link', () => ({ shareOrCopyLink: mocks.shareOrCopyLink }));
vi.mock('@/services/common/clipboard', () => ({ copyWithToast: mocks.copyWithToast }));

import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/feedback/toast';
import { useProfileMenu } from '@/hooks/social/profile/useProfileMenu';

const PUBKEY = 'a'.repeat(64);
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const render = (extra: Partial<Parameters<typeof useProfileMenu>[0]> = {}) =>
  renderHook(() => useProfileMenu({ pubkey: PUBKEY, displayName: 'Ana', ...extra }), { wrapper });

beforeEach(() => {
  mocks.shareOrCopyLink.mockReset();
  mocks.copyWithToast.mockReset();
  useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
  useToastStore.getState().clearToasts();
});

describe('useProfileMenu', () => {
  it('hands out the profile page link and the npub', () => {
    const { result } = render();
    expect(result.current.url).toContain('/p/');
    expect(result.current.npub).toMatch(/^npub1/);
  });

  it('toggles open and closes after a copy', () => {
    const { result } = render();
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.copy('x', 'Copied'));
    expect(mocks.copyWithToast).toHaveBeenCalledWith('x', 'Copied');
    expect(result.current.open).toBe(false);
  });

  it('confirms a share only when it happened', async () => {
    mocks.shareOrCopyLink.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { result } = render();
    act(() => result.current.toggle());
    act(() => result.current.share());
    await waitFor(() => expect(result.current.open).toBe(false));
    expect(useToastStore.getState().toasts).toHaveLength(0);
    act(() => result.current.share());
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(mocks.shareOrCopyLink).toHaveBeenCalledWith({ title: 'Ana', url: result.current.url });
  });

  it('closes, lets the host close, then zaps', () => {
    const order: string[] = [];
    const { result } = render({ onZap: () => order.push('zap'), onBeforeAction: () => order.push('before') });
    act(() => result.current.toggle());
    act(() => result.current.zap());
    expect(order).toEqual(['before', 'zap']);
    expect(result.current.open).toBe(false);
  });

  it('mutes and blocks', () => {
    const { result } = render();
    act(() => result.current.mute());
    expect(result.current.muted).toBe(true);
    act(() => result.current.block());
    expect(result.current.blocked).toBe(true);
  });
});
