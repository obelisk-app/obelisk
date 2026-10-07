import { describe, expect, it } from 'vitest';
import { relayBannerTestId } from '@/utils/feedback/relay-banner';

describe('relayBannerTestId', () => {
  it('names lost sockets and offline as the connection-loss banner, the rest as relay access', () => {
    expect(relayBannerTestId('disconnected')).toBe('connection-loss-banner');
    expect(relayBannerTestId('offline')).toBe('connection-loss-banner');
    expect(relayBannerTestId('restricted')).toBe('relay-access-banner');
  });
});
