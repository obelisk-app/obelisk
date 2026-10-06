import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock, userMetadataFixture } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    useUserMetadata: (pubkey) => (
      pubkey === 'a'.repeat(64) ? userMetadataFixture({ pubkey, displayName: 'Mallory', name: 'mallory' }) : null
    ),
  });
});

import MutedAndBlocked from '@/components/settings/MutedAndBlocked';
import { useModerationStore } from '@/store/moderation';

const MUTED = 'a'.repeat(64);
const BLOCKED = 'b'.repeat(64);

const renderPanel = () => render(
  <LocaleProvider initialLocale="en"><MutedAndBlocked /></LocaleProvider>,
);

beforeEach(() => {
  useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
});

describe('MutedAndBlocked', () => {
  it('says so when nothing is muted or blocked', () => {
    renderPanel();
    expect(screen.getByTestId('moderation-empty')).toBeInTheDocument();
  });

  it('lists muted and blocked people by display name', () => {
    useModerationStore.setState({ mutedPubkeys: [MUTED], blockedPubkeys: [BLOCKED] });
    renderPanel();
    expect(screen.getByText('Mallory')).toBeInTheDocument();
    expect(screen.getByText('Muted')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('undoes a mute from here', () => {
    // Before this panel the only unmute control was on the muted person's
    // own content - which is precisely what you no longer see.
    useModerationStore.setState({ mutedPubkeys: [MUTED] });
    renderPanel();
    fireEvent.click(screen.getByTestId('moderation-undo-mute'));
    expect(useModerationStore.getState().mutedPubkeys).toEqual([]);
  });

  it('undoes a block from here', () => {
    useModerationStore.setState({ blockedPubkeys: [BLOCKED] });
    renderPanel();
    fireEvent.click(screen.getByTestId('moderation-undo-block'));
    expect(useModerationStore.getState().blockedPubkeys).toEqual([]);
  });

  it('falls back to a short npub when the profile is unknown', () => {
    useModerationStore.setState({ mutedPubkeys: [BLOCKED] });
    renderPanel();
    expect(screen.getByText(/^npub1/)).toBeInTheDocument();
  });
});
