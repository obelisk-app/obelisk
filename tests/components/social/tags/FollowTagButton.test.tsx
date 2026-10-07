import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { useToastStore } from '@/store/feedback/toast';

const mocks = vi.hoisted(() => ({
  following: new Set<string>(),
  ready: true,
  toggle: vi.fn(),
}));
vi.mock('@/hooks/social/tags/useInterests', () => ({
  useInterests: () => ({
    tags: [...mocks.following],
    isFollowing: (tag: string) => mocks.following.has(tag),
    toggle: mocks.toggle,
    ready: mocks.ready,
  }),
}));

import FollowTagButton from '@/components/social/tags/FollowTagButton';

beforeEach(() => {
  mocks.following = new Set();
  mocks.ready = true;
  mocks.toggle.mockReset().mockResolvedValue(undefined);
  useToastStore.getState().clearToasts();
});

describe('FollowTagButton', () => {
  it('is not there for a reader who is not signed in', () => {
    renderWithBridge(<FollowTagButton tag="nostr" />, fakeBridge({ myPubkey: null }));
    expect(screen.queryByTestId('follow-tag-button')).toBeNull();
  });

  it('follows a tag without the click reaching the row behind it', async () => {
    const rowClick = vi.fn();
    renderWithBridge(<div onClick={rowClick}><FollowTagButton tag="nostr" /></div>, fakeBridge());
    const button = screen.getByTestId('follow-tag-button');
    expect(button).not.toHaveAttribute('data-following');
    fireEvent.click(button);
    expect(rowClick).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.toggle).toHaveBeenCalledWith('nostr'));
  });

  it('marks a followed tag and offers to unfollow it', () => {
    mocks.following = new Set(['nostr']);
    renderWithBridge(<FollowTagButton tag="nostr" />, fakeBridge());
    expect(screen.getByTestId('follow-tag-button')).toHaveAttribute('data-following', 'true');
  });

  it('waits while the list loads and while a toggle is in flight', async () => {
    mocks.ready = false;
    const { unmount } = renderWithBridge(<FollowTagButton tag="nostr" />, fakeBridge());
    expect(screen.getByTestId('follow-tag-button')).toBeDisabled();
    unmount();
    mocks.ready = true;
    let finish: () => void = () => {};
    mocks.toggle.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    renderWithBridge(<FollowTagButton tag="nostr" />, fakeBridge());
    fireEvent.click(screen.getByTestId('follow-tag-button'));
    expect(screen.getByTestId('follow-tag-button')).toBeDisabled();
    await act(async () => { finish(); });
    expect(screen.getByTestId('follow-tag-button')).not.toBeDisabled();
  });

  it('says so when the write fails', async () => {
    mocks.toggle.mockRejectedValue(new Error('no'));
    renderWithBridge(<FollowTagButton tag="art" />, fakeBridge());
    fireEvent.click(screen.getByTestId('follow-tag-button'));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ body: '#art' }));
    expect(screen.getByTestId('follow-tag-button')).not.toBeDisabled();
  });
});
