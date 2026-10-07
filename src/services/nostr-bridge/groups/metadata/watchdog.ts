/**
 * Watchdog for the relay-wide group subs: metadata (39000) and admin/member
 * (39001/39002).
 *
 * These are deliberately unfiltered: one REQ for every group on the relay
 * rather than N per-group REQs. That makes them the most expensive queries the
 * app issues, and on a loaded relay expensive means *slow* rather than failed:
 * measured 2026-09-12 against public.obelisk.ar, `{kinds:[39000]}` took 20.9s
 * to deliver its first event, and `{kinds:[39001,39002]}` 20.4s. Twenty
 * seconds for twenty events.
 *
 * Under the 5s default that read as a dead subscription: torn down at 5s,
 * retried on backoff, each retry restarting the same 20s scan, so the channel
 * list never populated from the relay at all and the user saw only whatever
 * `seedCacheForRelay` had on disk. Worse, the retries were themselves load on
 * the relay that was already too slow.
 *
 * A slow answer is still an answer, and these subs have a cached fallback
 * painted underneath them, so waiting costs nothing a user can see. The only
 * thing given up is speed-to-verdict on a genuinely dead relay, and that
 * verdict is owned by the whitelist preflight and the connection banner, not
 * by this watchdog.
 */
export const GROUP_SUB_WATCHDOG_MS = 45_000;
