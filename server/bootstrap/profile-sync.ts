// server/bootstrap/profile-sync.ts
// Background job: backfill missing profiles 10s after boot, then refresh
// stale ones every 6 hours.

import type { ServerContext } from '../context';

export function start(_ctx: ServerContext): void {
  void (async () => {
    const { backfillMissingProfiles, refreshStaleProfiles } = await import('../../src/lib/profile-sync');
    setTimeout(async () => {
      await backfillMissingProfiles().catch(console.error);
      await refreshStaleProfiles(0.25).catch(console.error); // refresh profiles older than 6h
    }, 10_000);
    setInterval(() => refreshStaleProfiles(0.25).catch(console.error), 6 * 60 * 60 * 1000);
  })();
}
