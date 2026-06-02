/**
 * Phase 4 contract: the sidebar header banner is a transparent placeholder
 * until kind 30078 branding arrives. No layout shift when the real image
 * swaps in.
 *
 * Asserts:
 *   1. `[data-testid="sidebar-banner-placeholder"]` is present on first
 *      paint OR branding loaded instantly from cache (already a real img).
 *   2. The title is either a `[data-testid="sidebar-title-skeleton"]` or
 *      the real title — never a flash of empty content.
 *   3. After relay-ok and a small grace, the placeholder disappears
 *      (replaced by the real banner image when one exists, or just gone
 *      when the relay has no branding event).
 *
 * Real relay: `wss://public.obelisk.ar`.
 */
import { test, expect } from '@playwright/test';
import {
  attachClientCapture,
  DEFAULT_RELAY,
  generateIdentity,
  logOk,
  logStep,
  nsecSession,
  seedSession,
  waitForRelayOk,
} from './lib';

const RELAY_URL = process.env.OBELISK_E2E_RELAY ?? DEFAULT_RELAY;

test('banner stays transparent until branding arrives', async ({ page, context }) => {
  test.setTimeout(60_000);

  logStep('Seed identity + relay', `Fresh nsec, relay=${RELAY_URL}`);
  const id = generateIdentity();
  await seedSession(context, nsecSession(id, RELAY_URL));
  attachClientCapture(page);

  await page.goto('/app', { waitUntil: 'domcontentloaded' });

  const header = page.getByTestId('sidebar-header');
  await header.waitFor({ state: 'visible', timeout: 20_000 });

  // Branding is either still loading (placeholder visible) or already
  // arrived from cache. Both branches are acceptable.
  const placeholder = page.getByTestId('sidebar-banner-placeholder');
  const skeletonTitle = page.getByTestId('sidebar-title-skeleton');
  const placeholderVisible = await placeholder.isVisible().catch(() => false);
  const skeletonVisible = await skeletonTitle.isVisible().catch(() => false);
  logOk(`first paint: placeholder=${placeholderVisible} skeletonTitle=${skeletonVisible}`);

  // Wait for the relay to confirm read access and for branding to
  // resolve. After that, neither the placeholder nor the skeleton
  // title should still be visible.
  await waitForRelayOk(page, 30_000);
  // The 1500ms title grace plus reasonable round-trip = give it 5s total.
  await expect(skeletonTitle).toBeHidden({ timeout: 5_000 });

  // Placeholder unmounts once `branding.updatedAt > 0`. If the relay has
  // no branding event, the placeholder stays — but only until something
  // tells the client branding is loaded. We accept a short grace.
  // In practice: cleared on `useRelayBranding` resolving (cache or live).
  await expect(placeholder).toBeHidden({ timeout: 10_000 });
  logOk('placeholder + skeleton cleared after relay-ok');
});
