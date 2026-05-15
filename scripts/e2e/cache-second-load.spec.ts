/**
 * Phase 1 contract: with bridgeCache wired through all relay-derived
 * state, a warm second load paints the sidebar instantly from disk —
 * well before the live REQ confirms.
 *
 * Method: warm the cache by loading the app once (waiting through
 * everything). Reload. Measure the time from `navigationStart` to the
 * first channel row being visible. Assert it stays under 1500ms — much
 * faster than a cold-load round-trip through `ensureRelay` + AUTH +
 * kind 39000.
 *
 * Note: this is a soft performance check that depends on the dev server
 * and relay latency. The 1500ms bound is generous enough to absorb
 * jitter and still catch a regression where cache seeding stopped
 * working (cold paint takes several seconds).
 */
import { test, expect } from '@playwright/test';
import {
  attachClientCapture,
  DEFAULT_RELAY,
  firstChannelRow,
  generateIdentity,
  logObserved,
  logOk,
  logStep,
  nsecSession,
  seedSession,
  waitForRelayOk,
} from './lib';

const RELAY_URL = process.env.OBELISK_E2E_RELAY ?? DEFAULT_RELAY;

test('second load paints sidebar from cache within 1500ms', async ({ page, context }) => {
  test.setTimeout(90_000);

  logStep('Warm pass — seed identity, fully connect, populate caches', `relay=${RELAY_URL}`);
  const id = generateIdentity();
  await seedSession(context, nsecSession(id, RELAY_URL));
  attachClientCapture(page);

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForRelayOk(page, 30_000);
  // Wait for channels to render so `seedCacheForRelay` has populated.
  await firstChannelRow(page).waitFor({ state: 'visible', timeout: 30_000 });
  // Give the cache writes a moment to settle.
  await page.waitForTimeout(500);
  logOk('warm pass complete — cache populated');

  // ── Cold reload — measure time to first channel row ──────────────
  logStep('Reload', 'Measure from navigation start to first channel row visible');
  const t0 = await page.evaluate(() => performance.now());
  void t0;
  const navStartedAt = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Race: either the first channel row is visible (cache hit), or the
  // loading spinner shows up (cache miss). We assert cache hit.
  const channel = firstChannelRow(page);
  await channel.waitFor({ state: 'visible', timeout: 5_000 });
  const paintedAt = Date.now();
  const elapsed = paintedAt - navStartedAt;
  logObserved(`first channel row visible at ${elapsed}ms`);
  expect(elapsed).toBeLessThan(1500);
  logOk(`cache-warm reload painted in ${elapsed}ms (< 1500ms)`);
});
