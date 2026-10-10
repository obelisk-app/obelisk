import { afterEach, expect, it, vi } from 'vitest';
import { generateSecretKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
const publish = vi.hoisted(() => vi.fn());
vi.mock('@nostr-wot/data', async (original) => ({ ...await original<typeof import('@nostr-wot/data')>(), getPool: () => ({ publish }) }));
import { publishGeneratedProfile } from '@/services/session/login';
const nsec = nip19.nsecEncode(generateSecretKey());
afterEach(() => vi.useRealTimers());
it('accepts the first relay acknowledgement and includes the complete profile', async () => {
  publish.mockReturnValue([new Promise(() => {}), Promise.resolve()]);
  await publishGeneratedProfile(nsec, { name: 'Test', about: 'About', picture: 'picture', banner: 'banner' });
  expect(JSON.parse(publish.mock.calls[0][1].content)).toEqual({ name: 'Test', display_name: 'Test', about: 'About', picture: 'picture', banner: 'banner' });
});
it('does not mistake settled rejections for publication', async () => {
  publish.mockReturnValue([Promise.reject(new Error('rejected'))]);
  await expect(publishGeneratedProfile(nsec, {})).rejects.toThrow();
});
it('bounds a stalled publish so the retained draft can be retried', async () => {
  vi.useFakeTimers();
  publish.mockReturnValue([new Promise(() => {})]);
  const result = expect(publishGeneratedProfile(nsec, {})).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(8_000);
  await result;
});
