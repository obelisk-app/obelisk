import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

const writeText = vi.fn();

vi.mock('@/lib/social/publish', () => ({ publishDelete: vi.fn().mockResolvedValue({}) }));

import NoteMenu from './NoteMenu';
import { useModerationStore } from '@/store/moderation';

const note: NostrEvent = {
  id: 'a'.repeat(64),
  pubkey: 'b'.repeat(64),
  content: 'the note text',
  created_at: 1000,
  tags: [['t', 'nostr']],
  kind: 1,
  sig: 'c'.repeat(128),
};

/** Fresh mount each time — clicking an item closes the menu. */
const open = (isMine = false) => {
  cleanup();
  render(
    <LocaleProvider initialLocale="en"><NoteMenu note={note} isMine={isMine} /></LocaleProvider>,
  );
  fireEvent.click(screen.getByTestId('note-more'));
};

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText }, share: undefined });
  useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
});

describe('NoteMenu', () => {
  it('offers far more than copy-link and mute', () => {
    // It used to hold exactly two items, which made it look like an
    // afterthought on what is a signed event on a public network.
    open();
    for (const id of [
      'note-menu-share',
      'note-menu-copy-link',
      'note-menu-raw',
      'note-menu-copy-id',
      'note-menu-copy-npub',
      'note-menu-copy-text',
      'note-menu-mute',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('copies an Obelisk share link, not an njump one', () => {
    open();
    fireEvent.click(screen.getByTestId('note-menu-copy-link'));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('/notes/');
    expect(copied).not.toContain('njump.me');
  });

  it('does not offer other clients — that belongs on the /notes page', () => {
    // Inside the app the reader is already in a client, and this menu is for
    // acting on a note. The offer is useful on the shared-link page, where
    // they arrived from outside and may prefer their own client.
    open();
    expect(screen.queryByTestId('note-menu-client-default')).not.toBeInTheDocument();
    expect(screen.queryByTestId('note-menu-client-jumble')).not.toBeInTheDocument();
    expect(screen.queryByTestId('note-menu-njump')).not.toBeInTheDocument();
  });

  it('shows the raw signed event', () => {
    open();
    fireEvent.click(screen.getByTestId('note-menu-raw'));
    const json = screen.getByTestId('note-raw-json').textContent ?? '';
    expect(JSON.parse(json)).toMatchObject({ id: note.id, sig: note.sig, kind: 1 });
  });

  it('copies the note text', () => {
    open();
    fireEvent.click(screen.getByTestId('note-menu-copy-text'));
    expect(writeText).toHaveBeenCalledWith('the note text');
  });

  it('copies the author npub', () => {
    open();
    fireEvent.click(screen.getByTestId('note-menu-copy-npub'));
    expect(writeText.mock.calls.at(-1)?.[0]).toMatch(/^npub1/);
  });

  it('offers deletion only on your own notes', () => {
    open(false);
    expect(screen.queryByTestId('note-menu-delete')).not.toBeInTheDocument();

    open(true);
    expect(screen.getByTestId('note-menu-delete')).toBeInTheDocument();
    // Muting yourself makes no sense.
    expect(screen.queryByTestId('note-menu-mute')).not.toBeInTheDocument();
  });

  it('renders outside the note card, not inside it', () => {
    // Note cards carry `contain: paint`, which clips their children and traps
    // their stacking context — an in-card menu rendered UNDER the next note
    // no matter its z-index. Portalling to body is the only fix that keeps
    // the containment (and so the scroll performance it buys).
    cleanup();
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <div className="note-card" data-testid="card">
          <NoteMenu note={note} isMine={false} />
        </div>
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByTestId('note-more'));

    const menu = screen.getByTestId('note-menu');
    expect(menu).toBeInTheDocument();
    expect(container.querySelector('[data-testid="note-menu"]')).toBeNull();
    expect(menu.closest('.note-card')).toBeNull();
    expect(document.body.contains(menu)).toBe(true);
  });

  it('is positioned with fixed coordinates so containment cannot clip it', () => {
    open();
    const menu = screen.getByTestId('note-menu');
    expect(menu.style.position).toBe('fixed');
  });

  it('closes on Escape', () => {
    open();
    expect(screen.getByTestId('note-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('note-menu')).not.toBeInTheDocument();
  });
});
