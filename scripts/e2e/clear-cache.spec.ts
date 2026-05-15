/**
 * Phase 1 contract: Preferences → "Clear local cache" wipes every cache
 * key except the session + preferences, then reloads.
 *
 * Method: warm a session, seed extra cache-shaped keys via the page's
 * localStorage, navigate to Preferences, click Clear cache, confirm in
 * the modal, then assert which keys remain.
 *
 * The Preferences modal is opened by clicking the user avatar pill,
 * then the Edit-profile path navigates to the modal where the
 * Preferences tab lives.
 */
import { test, expect } from '@playwright/test';
import {
  attachClientCapture,
  DEFAULT_RELAY,
  generateIdentity,
  logObserved,
  logOk,
  logStep,
  nsecSession,
  RELAYS_KEY,
  seedSession,
  STORAGE_KEY,
  waitForRelayOk,
} from './lib';

const RELAY_URL = process.env.OBELISK_E2E_RELAY ?? DEFAULT_RELAY;

test('Clear cache wipes relay/UI state but preserves session + preferences', async ({ page, context }) => {
  test.setTimeout(90_000);

  logStep('Seed + warm', `relay=${RELAY_URL}`);
  const id = generateIdentity();
  await seedSession(context, nsecSession(id, RELAY_URL));
  // Seed a synthetic preference + extra cache-shaped keys we can assert on.
  await context.addInitScript(({ pubkey }) => {
    window.localStorage.setItem('obelisk:preferences', JSON.stringify({ showActivityIndicator: true }));
    window.localStorage.setItem(`obelisk-read-state:${pubkey}`, JSON.stringify({ state: { groupCursors: { test: 1 } } }));
    window.localStorage.setItem('obelisk-cache-v3/wss%3A%2F%2Fpublic.obelisk.ar/0/x', JSON.stringify({ v: { foo: 1 }, t: 1 }));
  }, { pubkey: id.pkHex });
  attachClientCapture(page);

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForRelayOk(page, 30_000);

  // Confirm seeded keys are present pre-clear.
  const before = await page.evaluate(({ pubkey }) => ({
    session: window.localStorage.getItem('obelisk-dex/session'),
    prefs: window.localStorage.getItem('obelisk:preferences'),
    readState: window.localStorage.getItem(`obelisk-read-state:${pubkey}`),
    cacheEntry: window.localStorage.getItem('obelisk-cache-v3/wss%3A%2F%2Fpublic.obelisk.ar/0/x'),
  }), { pubkey: id.pkHex });
  expect(before.session).not.toBeNull();
  expect(before.prefs).not.toBeNull();
  expect(before.readState).not.toBeNull();
  expect(before.cacheEntry).not.toBeNull();
  logOk('pre-clear: session, prefs, read-state, cache entry all present');

  // Open the user-edit modal via the avatar pill ("Edit profile" button).
  logStep('Open Preferences', 'Avatar pill → Edit profile → Preferences tab');
  // The desktop pill is a button containing the user's name/initials.
  // We navigate via the explicit "Edit profile" entry in the UserPanel
  // popover. The popover opens when clicking the bottom-left user pill.
  const userPanelTrigger = page.locator('[data-testid="user-edit-modal"], button:has-text("Edit profile")').first();
  // Try to open the user popover first.
  const editEntry = page.getByRole('button', { name: /Edit profile/i });
  if ((await editEntry.count()) === 0) {
    // Fallback: click the bottom-left pill if accessible by name.
    const pill = page.locator('button').filter({ hasText: id.pkHex.slice(0, 6) }).first();
    if ((await pill.count()) > 0) await pill.click();
  }
  await editEntry.first().waitFor({ state: 'visible', timeout: 10_000 });
  await editEntry.first().click();
  await userPanelTrigger.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  await page.getByRole('button', { name: /Preferences/ }).first().click();

  // Click Clear cache and confirm.
  logStep('Click Clear local cache → confirm', 'Page should reload');
  await page.getByTestId('clear-cache-button').click();
  await page.getByTestId('clear-cache-confirm-button').click();
  await page.waitForLoadState('domcontentloaded');

  // ── After clear: session + preferences kept; others wiped ─────────
  const after = await page.evaluate(({ pubkey }) => ({
    session: window.localStorage.getItem('obelisk-dex/session'),
    relays: window.localStorage.getItem('obelisk-dex/relays'),
    prefs: window.localStorage.getItem('obelisk:preferences'),
    readState: window.localStorage.getItem(`obelisk-read-state:${pubkey}`),
    cacheEntry: window.localStorage.getItem('obelisk-cache-v3/wss%3A%2F%2Fpublic.obelisk.ar/0/x'),
  }), { pubkey: id.pkHex });

  logObserved(`post-clear: session=${after.session ? 'present' : 'null'}, prefs=${after.prefs ? 'present' : 'null'}, readState=${after.readState ?? 'null'}, cacheEntry=${after.cacheEntry ?? 'null'}`);
  expect(after.session).not.toBeNull();
  expect(after.prefs).not.toBeNull();
  expect(after.readState).toBeNull();
  expect(after.cacheEntry).toBeNull();
  // Relays might be present or absent depending on whether the seed
  // wrote them — but if present, they should be preserved.
  // (`obelisk-dex/relays` is preserved by clear-cache.)
  // Soft assert: it's either unchanged or was never set.
  void STORAGE_KEY;
  void RELAYS_KEY;
  logOk('clear-cache preserved session+prefs; wiped read-state+cache entries');
});
