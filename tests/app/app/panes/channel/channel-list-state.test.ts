import { describe, expect, it } from 'vitest';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import type { JsMessage } from '@/services/nostr-bridge';
import { channelEmptyStage, isGroupedWith } from '@/app/app/panes/channel/channel-list-state';
import { channelInviteLink } from '@/app/app/panes/channel/invite-link';

const group = groupFixture({ id: 'g', name: 'general', kind: 'text' });
const settled = { groupMetadataEose: true, channelMissingGrace: true, metadataFetchDone: true };

describe('channelEmptyStage', () => {
  it('waits on channel info while the group is unknown and any gate is still open', () => {
    expect(channelEmptyStage({ group: null, messagesStatus: 'loading', ...settled, groupMetadataEose: false })).toBe('loading-info');
    expect(channelEmptyStage({ group: null, messagesStatus: 'loading', ...settled, channelMissingGrace: false })).toBe('loading-info');
    expect(channelEmptyStage({ group: null, messagesStatus: 'loading', ...settled, metadataFetchDone: false })).toBe('loading-info');
  });

  it('declares the channel not visible only once all three gates have passed', () => {
    expect(channelEmptyStage({ group: null, messagesStatus: 'loading', ...settled })).toBe('not-visible');
  });

  it('keeps loading messages until the bridge confirms the channel is empty', () => {
    expect(channelEmptyStage({ group, messagesStatus: 'loading', ...settled })).toBe('loading-messages');
    expect(channelEmptyStage({ group, messagesStatus: 'empty-unconfirmed', ...settled })).toBe('loading-messages');
    expect(channelEmptyStage({ group, messagesStatus: 'empty-confirmed', ...settled })).toBe('welcome');
  });
});

describe('isGroupedWith', () => {
  const at = (pubkey: string, createdAt: number) => ({ id: `${pubkey}${createdAt}`, pubkey, createdAt }) as JsMessage;

  it('folds a message under the previous one from the same author within five minutes', () => {
    expect(isGroupedWith(at('a', 100), at('a', 399))).toBe(true);
  });

  it('does not fold across authors, after five minutes, or for the first message', () => {
    expect(isGroupedWith(at('a', 100), at('b', 101))).toBe(false);
    expect(isGroupedWith(at('a', 100), at('a', 400))).toBe(false);
    expect(isGroupedWith(undefined, at('a', 100))).toBe(false);
  });
});

describe('channelInviteLink', () => {
  it('keeps only the channel and the relay host, dropping whatever else was in the URL', () => {
    expect(channelInviteLink('https://obelisk.ar/app?s=feed&m=x', 'g1', 'wss://relay.example/'))
      .toBe('https://obelisk.ar/app?c=g1&relay=relay.example');
  });

  it('leaves the relay out when there is none', () => {
    expect(channelInviteLink('https://obelisk.ar/app', 'g1', '')).toBe('https://obelisk.ar/app?c=g1');
  });
});
