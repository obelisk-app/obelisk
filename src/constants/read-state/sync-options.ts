/**
 * Read state: sync options. Values the code in
 * `services/read-state/sync-options.ts` reads, kept here so every reader
 * imports the one copy.
 */

/** Inner rumor d-tag for groups-scope state events. */
export const D_TAG_GROUPS = 'obelisk:readstate:v1';

/** Inner rumor d-tag for DM-scope state events (also carries inboxLastReadAt). */
export const D_TAG_DMS = 'obelisk:dm-readstate:v1';

// 8s coalesces a burst of cursor advances during active reading without making
// the publish feel deferred. The previous 60s window collapsed against
// real-world usage: users read for less than a minute, then close the tab or
// navigate, and the cleanup cleared the pending timer before flush, so the
// gift wrap was never published and devices never converged. We now also
// flush eagerly on cleanup, visibilitychange to hidden, and pagehide so a
// partial debounce window doesn't lose the publish.
export const DEBOUNCE_MS = 8_000;

/** Schema version for the JSON payload inside the rumor. */
export const SCHEMA_VERSION = 1;

/**
 * How long this sub waits for its first event before the watchdog calls it dead.
 *
 * Much longer than the 5s default, because this REQ is unusually expensive and
 * unusually patient-able. `{kinds:[1059], '#p':[me]}` cannot be narrowed: the
 * outer wrap is signed by a throwaway key (so `authors` is useless), NIP-59
 * fuzzes `created_at` backwards by up to two days (so `since` would drop live
 * cursors), and the wrap that carries our cursors is a needle in a haystack of
 * DM wraps (so `limit` could cut it off). Tagging our own wraps to make them
 * findable is exactly the metadata leak docs/features/dm-metadata-privacy.md exists to
 * prevent.
 *
 * So the query is as broad as it has to be, and on a loaded relay it can take
 * tens of seconds to return anything. Under the default watchdog that read as
 * failure: the sub was torn down at 5s and retried on a backoff, each retry
 * re-running the same expensive scan, so the cursors never arrived and every
 * channel painted unread. Nothing here is time-critical (it is invisible
 * housekeeping behind a stale-while-revalidate cache), so waiting is strictly
 * better than retrying.
 */
export const READ_STATE_WATCHDOG_MS = 60_000;
