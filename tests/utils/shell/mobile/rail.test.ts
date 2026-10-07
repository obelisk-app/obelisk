import { describe, expect, it } from 'vitest';
import {
  isActiveRelay, relayTileLabel, relayTileLetter, serverBannerParts, unreadBadgeText,
} from '@/utils/shell/mobile/rail';

describe('relayTileLabel', () => {
  it('prefers branding, then NIP-11, then the host', () => {
    expect(relayTileLabel('Branded', 'Nip11', 'wss://relay.example')).toBe('Branded');
    expect(relayTileLabel(undefined, 'Nip11', 'wss://relay.example')).toBe('Nip11');
    expect(relayTileLabel('', '', 'wss://relay.example/')).toBe('relay.example');
    expect(relayTileLabel(null, null, 'not a url')).toBe('not a url');
  });
});

describe('relayTileLetter', () => {
  it('is the first letter, upper-cased', () => {
    expect(relayTileLetter('relay.example')).toBe('R');
    expect(relayTileLetter('')).toBe('');
  });
});

describe('unreadBadgeText', () => {
  it('shows the count up to 99, then 99+', () => {
    expect(unreadBadgeText(1)).toBe('1');
    expect(unreadBadgeText(99)).toBe('99');
    expect(unreadBadgeText(100)).toBe('99+');
  });
});

describe('isActiveRelay', () => {
  it('folds host case and a trailing slash, not path case', () => {
    expect(isActiveRelay('wss://Relay.One/', 'wss://relay.one')).toBe(true);
    expect(isActiveRelay('wss://relay.two/Group', 'wss://relay.two/group')).toBe(false);
  });

  it('matches nothing without an active relay', () => {
    expect(isActiveRelay('wss://relay.one', null)).toBe(false);
  });
});

describe('serverBannerParts', () => {
  it('reads host, letter and website from a relay URL', () => {
    expect(serverBannerParts('wss://relay.example/')).toEqual({
      host: 'relay.example', iconFallback: 'R', website: 'https://relay.example',
    });
  });

  it('has no website for a URL that is not ws or wss', () => {
    expect(serverBannerParts('relay.example')).toEqual({ host: 'relay.example', iconFallback: 'R', website: null });
  });

  it('falls back to O with no relay', () => {
    expect(serverBannerParts(null)).toEqual({ host: '', iconFallback: 'O', website: null });
  });
});
