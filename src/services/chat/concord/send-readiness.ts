import { firstValueFrom, filter, timeout } from 'rxjs';
import type { ConcordCommunity } from '@applesauce/concord/client';

/** Cached history can paint before the SDK has reconciled the current publishing keys. */
export async function awaitConcordSendReady(community: ConcordCommunity) {
  const phase = await firstValueFrom(community.phase$.pipe(filter(value => value !== 'idle' && value !== 'syncing'), timeout(20_000)));
  if (phase !== 'live') throw new Error('Community is not ready to publish');
}
