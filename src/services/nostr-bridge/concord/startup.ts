import type { ConcordClient } from '@applesauce/concord/client';

/** Expose the SDK's authenticated local mirror without waiting for relay reconciliation. */
export async function startConcordWithCache(client: Pick<ConcordClient, 'communities$' | 'start'>) {
  let available!: () => void;
  const cached = new Promise<void>(resolve => { available = resolve; });
  const subscription = client.communities$.subscribe(rows => { if (rows.length) available(); });
  const ready = client.start();
  // The caller observes readiness separately if cached state wins the race.
  void ready.catch(() => {});
  try {
    await Promise.race([cached, ready]);
    return { ready };
  } finally { subscription.unsubscribe(); }
}
