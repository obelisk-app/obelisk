import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

const mocks = vi.hoisted(() => ({
  fetchStarterPacks: vi.fn(),
  publishEvent: vi.fn(),
  follows: [] as string[],
  contactEvent: null as NostrEvent | null,
}));

vi.mock('@/lib/social/starter-packs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/social/starter-packs')>();
  return { ...actual, fetchStarterPacks: mocks.fetchStarterPacks };
});

vi.mock('@/lib/social/profiles', () => ({
  ensureSocialProfiles: vi.fn().mockResolvedValue(undefined),
  useSocialProfile: () => null,
}));

vi.mock('@/lib/nostr-bridge', () => ({
  getBridge: async () => ({ publishEvent: mocks.publishEvent }),
  nostrActions: { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) },
  useMyFollows: () => mocks.follows,
  useMyContactList: () => mocks.contactEvent,
  useUserMetadata: () => null,
}));

import StarterPacks from './StarterPacks';

const pk = (n: number) => String(n).repeat(64).slice(0, 64);

const pack = (over: Record<string, unknown> = {}) => ({
  id: '39089:curator:devs',
  title: 'Nostr devs',
  description: 'People who build the thing',
  image: null,
  curator: pk(9),
  members: [pk(1), pk(2), pk(3)],
  createdAt: 1,
  ...over,
});

const renderPacks = (props: Record<string, unknown> = {}) => render(
  <LocaleProvider initialLocale="en"><StarterPacks {...props} /></LocaleProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.follows = [];
  mocks.contactEvent = null;
  mocks.fetchStarterPacks.mockResolvedValue([pack()]);
  mocks.publishEvent.mockResolvedValue(undefined);
});

describe('StarterPacks', () => {
  it('shows a skeleton before the relays answer', () => {
    renderPacks();
    expect(screen.getByTestId('starter-packs-loading')).toBeInTheDocument();
  });

  it('lists packs with their size and a few faces', async () => {
    renderPacks();
    const card = await screen.findByTestId('starter-pack');
    expect(card).toHaveTextContent('Nostr devs');
    expect(card).toHaveTextContent('3 people');
    expect(screen.getAllByTestId('starter-pack-face')).toHaveLength(3);
  });

  it('follows the whole pack in ONE contact-list write', async () => {
    // Follows are a single replaceable event: a per-person loop races
    // itself and ends with whichever write landed last, i.e. one follow.
    renderPacks();
    fireEvent.click(await screen.findByTestId('starter-pack-follow'));

    await waitFor(() => expect(mocks.publishEvent).toHaveBeenCalledTimes(1));
    const [event] = mocks.publishEvent.mock.calls[0];
    expect(event.kind).toBe(3);
    expect(event.tags.filter((tag: string[]) => tag[0] === 'p')).toHaveLength(3);
  });

  it('merges into the existing list rather than replacing it', async () => {
    // Relay hints and petnames written by other clients live in these tags.
    mocks.contactEvent = {
      id: 'c', pubkey: pk(5), kind: 3, created_at: 10, sig: '', content: '{"relays":{}}',
      tags: [['p', pk(7), 'wss://hint.example', 'zoe']],
    };
    renderPacks();
    fireEvent.click(await screen.findByTestId('starter-pack-follow'));

    await waitFor(() => expect(mocks.publishEvent).toHaveBeenCalled());
    const [event] = mocks.publishEvent.mock.calls[0];
    expect(event.tags).toContainEqual(['p', pk(7), 'wss://hint.example', 'zoe']);
    expect(event.content).toBe('{"relays":{}}');
  });

  it('counts down how many are actually new', async () => {
    mocks.follows = [pk(1)];
    renderPacks();
    expect(await screen.findByTestId('starter-pack-follow')).toHaveTextContent('2');
    expect(screen.getByTestId('starter-pack')).toHaveTextContent('1 already followed');
  });

  it('disables the button once you follow everyone in it', async () => {
    mocks.follows = [pk(1), pk(2), pk(3)];
    renderPacks();
    const button = await screen.findByTestId('starter-pack-follow');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Following all');
  });

  it('points at Global only when the relays really have no packs', async () => {
    mocks.fetchStarterPacks.mockResolvedValue([]);
    renderPacks();
    expect(await screen.findByTestId('starter-packs-empty')).toHaveTextContent(/Global/);
  });

  it('survives relays that error rather than spinning forever', async () => {
    mocks.fetchStarterPacks.mockRejectedValue(new Error('no relay'));
    renderPacks();
    expect(await screen.findByTestId('starter-packs-empty')).toBeInTheDocument();
  });

  it('opens a member profile from a face', async () => {
    const onOpenProfile = vi.fn();
    renderPacks({ onOpenProfile });
    fireEvent.click((await screen.findAllByTestId('starter-pack-face'))[0]);
    expect(onOpenProfile).toHaveBeenCalledWith(pk(1));
  });
});
