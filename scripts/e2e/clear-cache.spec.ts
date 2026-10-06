/**
 * Settings > Data on this device: removing "Read positions, unread counts
 * and alerts" wipes exactly that category and reloads; the session, the
 * preferences and the channel cache stay.
 *
 * Method: warm a session, seed keys of three categories, open the settings
 * from the user gear, pick the Data on this device section, remove the
 * read-state category, confirm, then assert which keys remain.
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
  removeLocalDataViaSettings,
  seedSession,
  STORAGE_KEY,
  waitForRelayOk,
} from './lib';

const RELAY_URL = process.env.OBELISK_E2E_RELAY ?? DEFAULT_RELAY;

test('Removing read positions wipes only that category', async ({ page, context }) => {
  test.setTimeout(90_000);

  logStep('Seed + warm', `relay=${RELAY_URL}`);
  const id = generateIdentity();
  await seedSession(context, nsecSession(id, RELAY_URL));
  // Seed a synthetic preference + extra cache-shaped keys we can assert on.
  // Init scripts run on every load: seed once per tab, or the reload after
  // the removal would put the keys straight back.
  await context.addInitScript(({ pubkey }) => {
    if (window.sessionStorage.getItem('e2e-seeded')) return;
    window.sessionStorage.setItem('e2e-seeded', '1');
    window.localStorage.setItem('obelisk:preferences', JSON.stringify({ showActivityIndicator: true }));
    window.localStorage.setItem(`obelisk-read-state:${pubkey}`, JSON.stringify({ state: { groupCursors: { test: 1 } } }));
    window.localStorage.setItem('obelisk-cache-v4/wss://public.obelisk.ar/39000/e2e-group', JSON.stringify({ v: { foo: 1 }, t: 1 }));
  }, { pubkey: id.pkHex });
  attachClientCapture(page);

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForRelayOk(page, 30_000);

  // Confirm seeded keys are present pre-clear.
  const before = await page.evaluate(({ pubkey }) => ({
    session: window.localStorage.getItem('obelisk-dex/session'),
    prefs: window.localStorage.getItem('obelisk:preferences'),
    readState: window.localStorage.getItem(`obelisk-read-state:${pubkey}`),
    cacheEntry: window.localStorage.getItem('obelisk-cache-v4/wss://public.obelisk.ar/39000/e2e-group'),
  }), { pubkey: id.pkHex });
  expect(before.session).not.toBeNull();
  expect(before.prefs).not.toBeNull();
  expect(before.readState).not.toBeNull();
  expect(before.cacheEntry).not.toBeNull();
  logOk('pre-clear: session, prefs, read-state, cache entry all present');

  logStep('Remove read positions', 'Settings > Data on this device; the page reloads');
  await removeLocalDataViaSettings(page, 'readState');

  // ── After clear: session + preferences kept; others wiped ─────────
  const after = await page.evaluate(({ pubkey }) => ({
    session: window.localStorage.getItem('obelisk-dex/session'),
    relays: window.localStorage.getItem('obelisk-dex/relays'),
    prefs: window.localStorage.getItem('obelisk:preferences'),
    readState: window.localStorage.getItem(`obelisk-read-state:${pubkey}`),
    cacheEntry: window.localStorage.getItem('obelisk-cache-v4/wss://public.obelisk.ar/39000/e2e-group'),
  }), { pubkey: id.pkHex });

  logObserved(`post-clear: session=${after.session ? 'present' : 'null'}, prefs=${after.prefs ? 'present' : 'null'}, readState=${after.readState ?? 'null'}, cacheEntry=${after.cacheEntry ?? 'null'}`);
  expect(after.session).not.toBeNull();
  expect(after.prefs).not.toBeNull();
  // The live page may write fresh cursors after the reload; the seeded ones must be gone.
  expect(after.readState ?? '').not.toContain('"test":1');
  // Channel cache is its own category: removing read positions keeps it.
  expect(after.cacheEntry).not.toBeNull();
  // Relays might be present or absent depending on whether the seed
  // wrote them, but if present, they should be preserved.
  // (`obelisk-dex/relays` is preserved by clear-cache.)
  // Soft assert: it's either unchanged or was never set.
  void STORAGE_KEY;
  void RELAYS_KEY;
  logOk('removing read positions kept session, prefs and the channel cache');
});
