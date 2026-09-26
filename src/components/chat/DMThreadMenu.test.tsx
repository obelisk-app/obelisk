import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import { useModerationStore } from '@/store/moderation';
import DMThreadMenu from './DMThreadMenu';

const PEER = 'a'.repeat(64);

const renderMenu = (props: Record<string, unknown> = {}) => render(
  <LocaleProvider initialLocale="en">
    <DMThreadMenu peer={PEER} {...props} />
  </LocaleProvider>,
);

const openMenu = () => fireEvent.click(screen.getByTestId('dm-thread-menu'));

beforeEach(() => {
  useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('DMThreadMenu', () => {
  it('stays closed until the control is used', () => {
    renderMenu();
    expect(screen.queryByTestId('dm-thread-menu-panel')).toBeNull();
  });

  it('opens the actions', () => {
    renderMenu({ onOpenProfile: vi.fn() });
    openMenu();
    expect(screen.getByTestId('dm-menu-profile')).toBeInTheDocument();
    expect(screen.getByTestId('dm-menu-copy-npub')).toBeInTheDocument();
    expect(screen.getByTestId('dm-menu-mute')).toBeInTheDocument();
    expect(screen.getByTestId('dm-menu-block')).toBeInTheDocument();
  });

  it('opens the peer profile', () => {
    const onOpenProfile = vi.fn();
    renderMenu({ onOpenProfile });
    openMenu();
    fireEvent.click(screen.getByTestId('dm-menu-profile'));
    expect(onOpenProfile).toHaveBeenCalledWith(PEER);
  });

  it('omits the profile item when the host has nowhere to send it', () => {
    renderMenu();
    openMenu();
    expect(screen.queryByTestId('dm-menu-profile')).toBeNull();
  });

  it('copies a real npub, not the hex pubkey', () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('dm-menu-copy-npub'));
    const written = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(written).toMatch(/^npub1/);
    expect(written).not.toBe(PEER);
  });

  it('mutes and unmutes the peer', () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('dm-menu-mute'));
    expect(useModerationStore.getState().mutedPubkeys).toContain(PEER);

    openMenu();
    expect(screen.getByTestId('dm-menu-mute')).toHaveTextContent(/unmute/i);
    fireEvent.click(screen.getByTestId('dm-menu-mute'));
    expect(useModerationStore.getState().mutedPubkeys).not.toContain(PEER);
  });

  it('blocks the peer', () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('dm-menu-block'));
    expect(useModerationStore.getState().blockedPubkeys).toContain(PEER);
  });

  it('closes after an action rather than sitting open', () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('dm-menu-mute'));
    expect(screen.queryByTestId('dm-thread-menu-panel')).toBeNull();
  });

  it('is labelled for screen readers and reports its state', () => {
    renderMenu();
    const trigger = screen.getByTestId('dm-thread-menu');
    expect(trigger).toHaveAttribute('aria-label', 'Conversation options');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    openMenu();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
