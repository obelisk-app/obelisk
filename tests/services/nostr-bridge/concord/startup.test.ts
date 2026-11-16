import { BehaviorSubject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import type { CommunityState } from '@applesauce/concord';
import { startConcordWithCache } from '@/services/nostr-bridge/concord/startup';

it('exposes cached communities while relay startup remains pending', async () => {
  const communities$ = new BehaviorSubject<CommunityState[]>([]);
  let finish!: () => void;
  const ready = new Promise<void>(resolve => { finish = resolve; });
  const startup = startConcordWithCache({ communities$, start: vi.fn(() => ready) });
  communities$.next([{} as CommunityState]);
  const cached = await startup;
  expect(cached.ready).toBe(ready);
  expect(communities$.observers).toHaveLength(0);
  finish();
  await cached.ready;
});

it('waits for relay startup when there is no local membership and propagates failures', async () => {
  const communities$ = new BehaviorSubject<CommunityState[]>([]);
  await expect(startConcordWithCache({ communities$, start: vi.fn().mockRejectedValue(new Error('offline')) })).rejects.toThrow('offline');
  expect(communities$.observers).toHaveLength(0);
});
