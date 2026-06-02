/**
 * Phase 3 contract: when the relay socket drops mid-session, the
 * `ConnectionBanner` (`[data-testid="connection-loss-banner"]`) is
 * visible while `connectionState !== 'Connected'`. When the socket
 * recovers, the banner unmounts.
 *
 * The drop is simulated via `context.setOffline(true)` — Playwright's
 * built-in network kill switch. The browser closes every open WebSocket
 * and queues new connection attempts until offline is cleared.
 */
import { test, expect } from '@playwright/test';
import {
  attachClientCapture,
  DEFAULT_RELAY,
  firstChannelRow,
  generateIdentity,
  logOk,
  logStep,
  nsecSession,
  seedSession,
  waitForRelayOk,
} from './lib';

const RELAY_URL = process.env.OBELISK_E2E_RELAY ?? DEFAULT_RELAY;

test('connection-loss banner appears on socket drop and clears on recovery', async ({ page, context }) => {
  test.setTimeout(90_000);

  logStep('Seed + connect', `relay=${RELAY_URL}`);
  const id = generateIdentity();
  await seedSession(context, nsecSession(id, RELAY_URL));
  attachClientCapture(page);

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForRelayOk(page, 30_000);

  // Click into any channel so the chat pane (with the ConnectionBanner) mounts.
  await firstChannelRow(page).click();
  const banner = page.getByTestId('connection-loss-banner');
  await expect(banner).toBeHidden({ timeout: 5_000 });
  logOk('no banner while connected');

  // Kill the network — every open WebSocket closes, `relay.onclose`
  // fires, `connectionState` flips to 'Disconnected'.
  logStep('Kill network', 'setOffline(true) closes every open WebSocket');
  await context.setOffline(true);
  await expect(banner).toBeVisible({ timeout: 10_000 });
  const state = await banner.getAttribute('data-state');
  logOk(`banner visible with state=${state}`);
  expect(state).not.toBe('Connected');

  // Restore the network — `reconnectInBackground()` brings the socket
  // back up within a few backoff cycles and `connectionState` returns
  // to 'Connected', unmounting the banner.
  logStep('Restore network', 'setOffline(false); reconnect loop heals');
  await context.setOffline(false);
  await expect(banner).toBeHidden({ timeout: 30_000 });
  logOk('banner cleared after reconnect');
});
