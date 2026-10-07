import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@tests/support/intl';

const mocks = vi.hoisted(() => ({
  publishNote: vi.fn(),
  publishReply: vi.fn(),
  publishQuote: vi.fn(),
  uploadToBlossom: vi.fn(),
}));

vi.mock('@/services/social/publish', () => ({
  publishNote: mocks.publishNote,
  publishReply: mocks.publishReply,
  publishQuote: mocks.publishQuote,
}));

vi.mock('@/services/media/blossom', () => ({ uploadToBlossom: mocks.uploadToBlossom }));

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock, userMetadataFixture } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    useMyPubkey: () => 'b'.repeat(64),
    useUserMetadata: () => userMetadataFixture({ displayName: 'Alice' }),
  });
});

import MobileComposer from '@/components/social/composer/MobileComposer';

const note = (over: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'n1',
  pubkey: 'a'.repeat(64),
  kind: 1,
  content: 'the original note',
  created_at: 1,
  tags: [],
  sig: '',
  ...over,
});

const renderComposer = (props: Record<string, unknown> = {}) => render(
  <LocaleProvider initialLocale="en">
    <MobileComposer onClose={vi.fn()} {...props} />
  </LocaleProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publishNote.mockResolvedValue(note({ id: 'published' }));
});

describe('MobileComposer', () => {
  it('takes the whole screen instead of floating in a modal', () => {
    // A centred card plus the software keyboard leaves about two lines to
    // write in, which is what this replaces.
    renderComposer();
    expect(screen.getByTestId('mobile-composer').className).toContain('fixed inset-0');
  });

  it('puts Post in the header, where the keyboard cannot cover it', () => {
    renderComposer();
    const header = screen.getByTestId('mobile-composer-post').closest('header');
    expect(header).not.toBeNull();
  });

  it('will not post an empty note', () => {
    renderComposer();
    expect(screen.getByTestId('mobile-composer-post')).toBeDisabled();
  });

  it('publishes the draft', async () => {
    const onPublished = vi.fn();
    renderComposer({ onPublished });

    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'gm nostr' } });
    fireEvent.click(screen.getByTestId('mobile-composer-post'));

    await waitFor(() => expect(mocks.publishNote).toHaveBeenCalledWith('gm nostr', [], { contentWarning: null }));
    expect(onPublished).toHaveBeenCalled();
  });

  it('publishes a reply against its parent', async () => {
    mocks.publishReply.mockResolvedValue(note({ id: 'reply' }));
    const parent = note();
    renderComposer({ mode: { kind: 'reply', parent } });

    // The parent is shown, so you can see what you're answering.
    expect(screen.getByTestId('mobile-composer-context')).toHaveTextContent('the original note');

    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'nice' } });
    fireEvent.click(screen.getByTestId('mobile-composer-post'));

    await waitFor(() => expect(mocks.publishReply).toHaveBeenCalled());
    expect(mocks.publishReply.mock.calls[0][0]).toBe(parent);
  });

  it('marks a note sensitive from the tool row', async () => {
    renderComposer();
    fireEvent.click(screen.getByTestId('composer-sensitive'));
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'nsfw' } });
    fireEvent.click(screen.getByTestId('mobile-composer-post'));

    await waitFor(() => expect(mocks.publishNote).toHaveBeenCalledWith('nsfw', [], { contentWarning: '' }));
  });

  it('surfaces a publish failure instead of closing silently', async () => {
    mocks.publishNote.mockRejectedValue(new Error('no relay accepted it'));
    const onPublished = vi.fn();
    renderComposer({ onPublished });

    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'gm' } });
    fireEvent.click(screen.getByTestId('mobile-composer-post'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not publish to the feed relays.');
    expect(onPublished).not.toHaveBeenCalled();
  });

  it('writes at 16px, so iOS does not zoom the viewport on focus', () => {
    // Safari zooms a focused input under 16px and never zooms back out.
    renderComposer();
    expect(screen.getByTestId('composer-input').className).toContain('text-base');
  });

  it('counts what you have written', () => {
    renderComposer();
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'hello' } });
    expect(screen.getByTestId('mobile-composer-count')).toHaveTextContent('5');
  });
});

describe('MobileComposer file picker', () => {
  it('is a named control, not an anonymous file input', () => {
    renderComposer();
    const picker = screen.getByTestId('composer-files');
    expect(picker).toHaveAttribute('type', 'file');
    expect(picker).toHaveAccessibleName('Upload');
  });
});
