/**
 * Phase 3 contract: the whitelist preflight surfaces a rejection within
 * ~1.5s — well before the 4s deferred soak the rest of the fan-out uses.
 *
 * Seeds a fresh nsec onto the restricted relay (default
 * `wss://lacrypta-relay.obelisk.ar`, overridable via `OBELISK_E2E_RESTRICTED_RELAY`),
 * then asserts `[data-testid="relay-access-banner"]` flips to
 * `data-state="restricted"` (or `auth-required`) within 3500ms — under
 * the legacy 4000ms soak.
 *
 * Run with the restricted relay (default is provided):
 *   npm run test:e2e -- scripts/e2e/whitelist-rejection.spec.ts
 *
 * Or override:
 *   OBELISK_E2E_RESTRICTED_RELAY=wss://your.relay npm run test:e2e
 */
import { test, expect } from '@playwright/test';
import {
  attachClientCapture,
  DEFAULT_RESTRICTED_RELAY,
  generateIdentity,
  logObserved,
  logOk,
  logStep,
  restrictedNsecSession,
  seedSession,
} from './lib';

const RESTRICTED_RELAY = process.env.OBELISK_E2E_RESTRICTED_RELAY ?? DEFAULT_RESTRICTED_RELAY;

test('preflight surfaces whitelist rejection within ~1.5s (no 4s soak)', async ({ page, context }) => {
  test.setTimeout(60_000);

  logStep(
    'Seed identity + restricted relay',
    `Fresh nsec → ${RESTRICTED_RELAY}; preflight should flip relay-access to restricted quickly.`,
  );
  const id = generateIdentity();
  await seedSession(context, restrictedNsecSession(id));
  logObserved(`npub  ${id.npub}`);
  logObserved(`relay ${RESTRICTED_RELAY}`);
  attachClientCapture(page);

  const start = Date.now();
  await page.goto('/app', { waitUntil: 'domcontentloaded' });

  // Banner with data-state=restricted. A refused key's REQs come back
  // `restricted:` (or, from older relays, `auth-required:` after a successful
  // AUTH, which classifyAccessClose reads the same way). The banner may show
  // "authenticating" for a moment first, so wait for the verdict itself
  // rather than reading whichever state is up first.
  const restricted = page.locator('[data-testid="relay-access-banner"][data-state="restricted"]').first();
  await restricted.waitFor({ state: 'visible', timeout: 5_000 });
  const elapsed = Date.now() - start;
  logObserved(`relay-access banner state=restricted after ${elapsed}ms`);
  // Soft assertion: the preflight should land well under 4000ms (the
  // legacy soak). Allow up to 3500ms for navigation + cold-handshake.
  expect(elapsed).toBeLessThan(3500);

  // And it must stick. nostr-tools fires a synthetic EOSE before every relay
  // CLOSED, and every retry re-enters automaticallyAuth; either used to flip
  // the verdict back to 'ok' ("No channels found") or 'authenticating'.
  await page.waitForTimeout(6_000);
  const banner = page.locator('[data-testid="relay-access-banner"]').first();
  expect(await banner.getAttribute('data-state')).toBe('restricted');
  logOk(`whitelist rejection surfaced in ${elapsed}ms — under 4s soak`);
});

// The phone shell has no banner; a refused key sees the channel list's empty
// state. It used to read "No channels found" — access had been flipped back to
// 'ok' by the synthetic EOSE nostr-tools fires before every relay CLOSED.
test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('channel list says "Whitelisting required", not "No channels found"', async ({ page, context }) => {
    test.setTimeout(60_000);
    const id = generateIdentity();
    await seedSession(context, restrictedNsecSession(id));
    attachClientCapture(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });

    const empty = page.locator('[data-testid="channels-empty"]').first();
    await expect(empty).toHaveAttribute('data-state', 'Whitelisting required', { timeout: 8_000 });
    // Past the 6s "waited" timer that would otherwise relabel it.
    await page.waitForTimeout(7_000);
    await expect(empty).toHaveAttribute('data-state', 'Whitelisting required');
    logOk('mobile channel list shows "Whitelisting required" and keeps it');
  });
});
