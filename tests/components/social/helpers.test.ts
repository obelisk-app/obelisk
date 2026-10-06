import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicKey } from 'nostr-tools/pure';
import type { Event as NostrEvent } from 'nostr-tools';

const pushToast = vi.hoisted(() => vi.fn());
vi.mock('@/store/toast', () => ({ useToastStore: { getState: () => ({ pushToast }) } }));

import { safeNpub } from '@/components/social/pubkey-npub';
import { shortHost } from '@/utils/relay-url/url-host';
import { formatCount } from '@/components/social/format-count';
import { formatCount as reexported } from '@/components/social/NoteActions';
import { isVideo } from '@/components/social/media-type';
import { copyRaw } from '@/components/social/copy-raw';
import { articleDate } from '@/components/social/article-meta';

afterEach(() => vi.unstubAllGlobals());

describe('safeNpub', () => {
  it('encodes a hex pubkey and passes anything else through', () => {
    const pubkey = getPublicKey(new Uint8Array(32).fill(3));
    expect(safeNpub(pubkey)).toMatch(/^npub1/);
    expect(safeNpub('not-hex')).toBe('not-hex');
  });
});

describe('shortHost', () => {
  it('keeps the host and falls back to the input', () => {
    expect(shortHost('wss://relay.damus.io/path')).toBe('relay.damus.io');
    expect(shortHost('not a url')).toBe('not a url');
  });
});

describe('formatCount', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1234)).toBe('1.2k');
    expect(formatCount(12345)).toBe('12k');
    expect(formatCount(1_250_000)).toBe('1.3M');
  });

  it('is still exported from NoteActions', () => {
    expect(reexported).toBe(formatCount);
  });
});

describe('isVideo', () => {
  it('trusts the MIME type when there is one', () => {
    expect(isVideo({ url: 'https://x/a.mp4', mimeType: 'image/png' })).toBe(false);
    expect(isVideo({ url: 'https://x/a', mimeType: 'video/webm' })).toBe(true);
  });

  it('falls back to the extension, query strings included', () => {
    expect(isVideo({ url: 'https://x/a.MOV?x=1' })).toBe(true);
    expect(isVideo({ url: 'https://x/a.jpg' })).toBe(false);
  });
});

describe('copyRaw', () => {
  it('copies the raw event and confirms', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const note = { id: 'a', pubkey: 'b', kind: 1, content: 'hi', tags: [], created_at: 1, sig: 'c' } as NostrEvent;
    copyRaw(note, 'Copied');
    expect(String(writeText.mock.calls[0][0])).toContain('"content": "hi"');
    expect(pushToast).toHaveBeenCalledWith({ title: 'Copied', body: '' });
  });
});

describe('articleDate', () => {
  it('formats a publication date in the app locale', () => {
    expect(articleDate('en', 1_700_000_000)).toMatch(/2023/);
  });
});
