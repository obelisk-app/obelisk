import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { invalidateRuntimeCaches } from '@/services/local-data/runtime-caches';
import { removeLocalDataCategory } from '@/services/local-data/remove';
import { lowerAllWriteFences } from '@/services/local-data/write-fence';

const query = vi.hoisted(() => vi.fn());
vi.mock('@/services/social/pool', () => ({
  querySocial: query, socialRelays: () => ['wss://profiles.example'],
}));
import { _resetSocialProfiles, ensureSocialProfiles, getSocialProfile, subscribeSocialProfile } from '@/services/social/profiles';

const pubkey = 'a'.repeat(64);
const note = (name: string): NostrEvent => ({ id: name, pubkey, kind: 0, tags: [], content: JSON.stringify({ name }), created_at: 1, sig: '' });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { _resetSocialProfiles(); localStorage.clear(); query.mockReset(); });
afterEach(() => { _resetSocialProfiles(); lowerAllWriteFences(); localStorage.clear(); });

it('keeps active subscribers and refetches visible profiles without reseeding old persisted values', async () => {
  query.mockResolvedValueOnce([note('Old')]);
  await ensureSocialProfiles([pubkey]);
  const seen: Array<string | null> = [];
  const unsubscribe = subscribeSocialProfile(pubkey, () => seen.push(getSocialProfile(pubkey)?.name ?? null));
  const next = deferred<NostrEvent[]>();
  query.mockReturnValueOnce(next.promise);
  invalidateRuntimeCaches({ categories: ['profiles'], scope: 'public' });
  expect(getSocialProfile(pubkey)).toBeNull();
  expect(seen).toContain(null);
  expect(query).toHaveBeenCalledTimes(2);
  next.resolve([note('New')]);
  await vi.waitFor(() => expect(getSocialProfile(pubkey)?.name).toBe('New'));
  expect(seen.at(-1)).toBe('New');
  unsubscribe();
  invalidateRuntimeCaches({ categories: ['profiles'], scope: 'public' });
  expect(query).toHaveBeenCalledTimes(2);
});

it('restarts a subscribed first lookup and prevents the retired request from clearing its replacement', async () => {
  const old = deferred<NostrEvent[]>();
  const next = deferred<NostrEvent[]>();
  query.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const unsubscribe = subscribeSocialProfile(pubkey, vi.fn());
  const first = ensureSocialProfiles([pubkey]);
  invalidateRuntimeCaches({ categories: ['profiles'], scope: 'public' });
  expect(query).toHaveBeenCalledTimes(2);
  old.resolve([note('Stale')]);
  await first;
  expect(getSocialProfile(pubkey)).toBeNull();
  expect(localStorage.length).toBe(0);
  await ensureSocialProfiles([pubkey]);
  expect(query).toHaveBeenCalledTimes(2);
  next.resolve([note('Current')]);
  await vi.waitFor(() => expect(getSocialProfile(pubkey)?.name).toBe('Current'));
  unsubscribe();
});

it('category removal clears visible profiles without starting network work before reload', async () => {
  query.mockResolvedValueOnce([note('Old')]);
  await ensureSocialProfiles([pubkey]);
  const onChange = vi.fn(() => expect(getSocialProfile(pubkey)).toBeNull());
  const unsubscribe = subscribeSocialProfile(pubkey, onChange);
  onChange.mockClear();
  const reload = vi.fn();
  await removeLocalDataCategory('profiles', { logout: vi.fn(), reload, relocate: vi.fn() });
  expect(getSocialProfile(pubkey)).toBeNull();
  expect(onChange).toHaveBeenCalledOnce();
  expect(query).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledOnce();
  expect(localStorage.length).toBe(0);
  unsubscribe();
});
