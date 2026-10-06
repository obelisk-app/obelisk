import { afterEach, describe, expect, it, vi } from 'vitest';
import { autolinkLabel } from '@/components/chat/message/autolink-label';
import { formatAudioTime, nextPlaybackRate } from '@/components/chat/message/audio-time';
import { chatLinkTarget, navigateInApp } from '@/components/chat/message/chat-link';
import { stickerSelection } from '@/components/chat/message/sticker-selection';
import { isAudioOnlyWebm } from '@/components/chat/message/VideoMedia';
import type { JsMediaPack } from '@/services/nostr-bridge';

describe('autolinkLabel', () => {
  it('leaves short and author-labelled links alone', () => {
    expect(autolinkLabel('https://a.example/', 'https://a.example/')).toBeNull();
    expect(autolinkLabel('https://a.example/' + 'x'.repeat(80), 'my label')).toBeNull();
  });

  it('shortens a long bare URL to host and path with an ellipsis', () => {
    const href = 'https://njump.me/' + 'naddr1'.padEnd(90, 'q');
    const label = autolinkLabel(href, [href]);
    expect(label).not.toBeNull();
    expect(label!.startsWith('njump.me/naddr1')).toBe(true);
    expect(label!.length).toBe(48);
    expect(label!.endsWith('…')).toBe(true);
  });
});

describe('audio helpers', () => {
  it('formats m:ss and guards bad input', () => {
    expect(formatAudioTime(0)).toBe('0:00');
    expect(formatAudioTime(65.9)).toBe('1:05');
    expect(formatAudioTime(Number.NaN)).toBe('0:00');
    expect(formatAudioTime(-1)).toBe('0:00');
  });

  it('cycles playback speed 1 -> 1.5 -> 2 -> 1', () => {
    expect(nextPlaybackRate(1)).toBe(1.5);
    expect(nextPlaybackRate(1.5)).toBe(2);
    expect(nextPlaybackRate(2)).toBe(1);
  });

  it('spots a picture-less webm as a voice note', () => {
    expect(isAudioOnlyWebm('https://x/a.webm', 0, 3)).toBe(true);
    expect(isAudioOnlyWebm('https://x/a.webm?x=1', 0, 3)).toBe(true);
    expect(isAudioOnlyWebm('https://x/a.webm', 640, 3)).toBe(false);
    expect(isAudioOnlyWebm('https://x/a.mp4', 0, 3)).toBe(false);
    expect(isAudioOnlyWebm('https://x/a.webm', 0, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('chatLinkTarget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads slug, message and post from a same-origin /chat link', () => {
    const href = `${window.location.origin}/chat?c=general&m=abc`;
    expect(chatLinkTarget(href)).toEqual({ path: '/chat?c=general&m=abc', slug: 'general', messageId: 'abc', postId: undefined });
    expect(chatLinkTarget('/chat?p=xyz')).toEqual({ path: '/chat?p=xyz', slug: null, messageId: undefined, postId: 'xyz' });
  });

  it('ignores other origins and paths', () => {
    expect(chatLinkTarget('https://other.example/chat?c=x')).toBeNull();
    expect(chatLinkTarget(`${window.location.origin}/notes/1`)).toBeNull();
  });

  it('navigates with pushState and a popstate event', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const onPop = vi.fn();
    window.addEventListener('popstate', onPop);
    navigateInApp('/chat?c=general');
    window.removeEventListener('popstate', onPop);
    expect(push).toHaveBeenCalledWith(null, '', '/chat?c=general');
    expect(onPop).toHaveBeenCalledTimes(1);
  });
});

describe('stickerSelection', () => {
  const pack = {
    address: '30030:aa:pack',
    items: [{ name: 'wave', url: 'https://x/wave.png', kind: 'sticker' }],
  } as unknown as JsMediaPack;

  it('finds the pack by address, or by the URL it holds', () => {
    expect(stickerSelection({ name: 'wave', url: 'https://x/wave.png', packAddress: '30030:aa:pack' }, { '30030:aa:pack': pack }).pack).toBe(pack);
    expect(stickerSelection({ name: 'wave', url: 'https://x/wave.png' }, { '30030:aa:pack': pack }).pack).toBe(pack);
  });

  it('falls back to an item built from the sticker', () => {
    expect(stickerSelection({ name: 'solo', url: 'https://x/solo.png' }, {})).toEqual({
      item: { name: 'solo', url: 'https://x/solo.png', kind: 'sticker' },
    });
  });
});
