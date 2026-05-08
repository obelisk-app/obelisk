import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isUserWatchingChannel, isUserWatchingDM } from './read-gates';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';

function setVisible(value: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (value ? 'visible' : 'hidden'),
  });
}

describe('isUserWatchingChannel', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isNearBottom: true,
    } as any);
    setVisible(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when all gates pass', () => {
    expect(isUserWatchingChannel('ch1')).toBe(true);
  });

  it('returns false when tab is hidden', () => {
    setVisible(false);
    expect(isUserWatchingChannel('ch1')).toBe(false);
  });

  it('returns false when window is blurred', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(isUserWatchingChannel('ch1')).toBe(false);
  });

  it('returns false when target channel is not the active channel', () => {
    expect(isUserWatchingChannel('ch-other')).toBe(false);
  });

  it('returns false when scrolled up', () => {
    useChatStore.setState({ isNearBottom: false } as any);
    expect(isUserWatchingChannel('ch1')).toBe(false);
  });

  it('returns false when there is no active channel', () => {
    useChatStore.setState({ activeChannelId: null } as any);
    expect(isUserWatchingChannel('ch1')).toBe(false);
  });
});

describe('isUserWatchingDM', () => {
  const other = 'aa'.repeat(32);

  beforeEach(() => {
    useDMStore.setState({ activeDMPubkey: other } as any);
    setVisible(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when visible + focused + thread active', () => {
    expect(isUserWatchingDM(other)).toBe(true);
  });

  it('returns false when tab hidden', () => {
    setVisible(false);
    expect(isUserWatchingDM(other)).toBe(false);
  });

  it('returns false when window blurred', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(isUserWatchingDM(other)).toBe(false);
  });

  it('returns false when target thread is not active', () => {
    expect(isUserWatchingDM('bb'.repeat(32))).toBe(false);
  });
});
