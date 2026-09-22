import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const mocks = vi.hoisted(() => ({
  publishEvent: vi.fn(),
  myPubkey: 'me'.repeat(32),
  contactEvent: null as NostrEvent | null,
  ready: true,
}));

vi.mock('@/lib/nostr-bridge', () => ({
  getBridge: async () => ({ publishEvent: mocks.publishEvent }),
  useMyPubkey: () => mocks.myPubkey,
  useMyContactList: () => mocks.contactEvent,
  useMyContactListReady: () => mocks.ready,
}));

vi.mock('@/lib/preferences', () => ({
  usePreferences: () => ({ socialRelays: ['wss://a.example'] }),
}));

import FollowButton from './FollowButton';

const TARGET = 'a'.repeat(64);

const contacts = (tags: string[][]): NostrEvent => ({
  id: 'c', pubkey: mocks.myPubkey, kind: 3, created_at: 10, content: '{"x":1}', tags, sig: '',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.myPubkey = 'b'.repeat(64);
  mocks.contactEvent = null;
  mocks.ready = true;
  mocks.publishEvent.mockResolvedValue(undefined);
});

describe('FollowButton', () => {
  it('follows, preserving the rest of the contact list', async () => {
    mocks.contactEvent = contacts([['p', 'c'.repeat(64), 'wss://hint', 'zoe']]);
    render(<FollowButton pubkey={TARGET} />);

    fireEvent.click(screen.getByTestId('follow-button'));
    await waitFor(() => expect(mocks.publishEvent).toHaveBeenCalled());

    const [event] = mocks.publishEvent.mock.calls[0];
    expect(event.kind).toBe(3);
    expect(event.tags).toContainEqual(['p', 'c'.repeat(64), 'wss://hint', 'zoe']);
    expect(event.tags.some((tag: string[]) => tag[1] === TARGET)).toBe(true);
    expect(event.content).toBe('{"x":1}');
  });

  it('unfollows when already following', async () => {
    mocks.contactEvent = contacts([['p', TARGET]]);
    render(<FollowButton pubkey={TARGET} />);
    expect(screen.getByTestId('follow-button')).toHaveTextContent('Following');

    fireEvent.click(screen.getByTestId('follow-button'));
    await waitFor(() => expect(mocks.publishEvent).toHaveBeenCalled());
    const [event] = mocks.publishEvent.mock.calls[0];
    expect(event.tags.some((tag: string[]) => tag[1] === TARGET)).toBe(false);
  });

  it('waits for the contact list, so it cannot wipe it', async () => {
    // Publishing without it replaces the list with a single entry — i.e.
    // silently unfollows everyone.
    mocks.ready = false;
    render(<FollowButton pubkey={TARGET} />);
    const button = screen.getByTestId('follow-button');
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(mocks.publishEvent).not.toHaveBeenCalled();
  });

  it('renders nothing when there is nobody to publish as', () => {
    mocks.myPubkey = '';
    const { container } = render(<FollowButton pubkey={TARGET} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for yourself', () => {
    mocks.myPubkey = TARGET;
    const { container } = render(<FollowButton pubkey={TARGET} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not navigate the row it sits inside', () => {
    const onClick = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/anchor-is-valid
      <a href="#x" onClick={onClick}><FollowButton pubkey={TARGET} /></a>,
    );
    fireEvent.click(screen.getByTestId('follow-button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('offers a retry when publishing fails', async () => {
    mocks.publishEvent.mockRejectedValue(new Error('no relay'));
    render(<FollowButton pubkey={TARGET} />);
    fireEvent.click(screen.getByTestId('follow-button'));
    await waitFor(() => expect(screen.getByTestId('follow-button')).toHaveTextContent('Retry'));
  });
});
