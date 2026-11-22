import { firstValueFrom, filter, skip, timeout } from 'rxjs';
import type { ConcordCommunity } from '@applesauce/concord/client';

/** Cached history can paint before the SDK has reconciled the current publishing keys. */
export async function awaitConcordSendReady(community: ConcordCommunity, retrying = false, waitMs = 20_000) {
  const phase = await firstValueFrom(community.phase$.pipe(skip(retrying ? 1 : 0), filter(value => value !== 'idle' && value !== 'syncing'), timeout(waitMs)));
  if (phase !== 'live') throw new Error('Community is not ready to publish');
}
