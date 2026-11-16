import { test, expect } from '@playwright/test';
import { finalizeEvent, nip44, Relay } from 'nostr-tools';
import { createTestPersonas } from '../persona-identity';
import { nsecSession, seedSession } from '../lib';
import { COMMUNITY_CONNECTIONS_ID } from '../../../src/constants/chat/community-connections';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test('restores NIP-29 community connections from the user inbox on a fresh phone', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const person = createTestPersonas().owner;
  const secret = Uint8Array.from(Buffer.from(person.skHex, 'hex'));
  const inboxUrl = 'wss://relay.ditto.pub';
  const created_at = Math.floor(Date.now() / 1000);
  const inboxList = finalizeEvent({ kind: 10050, created_at, tags: [['relay', inboxUrl]], content: '' }, secret);
  const appData = finalizeEvent({ kind: 30078, created_at, tags: [['d', COMMUNITY_CONNECTIONS_ID]],
    content: nip44.v2.encrypt(JSON.stringify({ version: 1, relays: {
      'wss://public.obelisk.ar': { at: Date.now(), value: true },
      'wss://relay.damus.io': { at: Date.now(), value: true },
    }, channels: { 'wss://public.obelisk.ar|general': { at: Date.now(), value: { notify: 'all' } } } }), nip44.v2.utils.getConversationKey(secret, person.pkHex)),
  }, secret);
  const targets = ['wss://purplepag.es', 'wss://public.obelisk.ar', 'wss://lacrypta-relay.obelisk.ar'];
  const published = await Promise.allSettled(targets.map(async url => {
    const relay = await Relay.connect(url);
    try { await relay.publish(inboxList); } finally { relay.close(); }
  }));
  expect(published.some(result => result.status === 'fulfilled')).toBe(true);
  const inbox = await Relay.connect(inboxUrl);
  try { await inbox.publish(appData); } finally { inbox.close(); }
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    await seedSession(context, nsecSession(person));
    const page = await context.newPage();
    await page.goto('/app');
    await page.getByTestId('analytics-consent').getByRole('button', { name: "Don't allow", exact: true }).click();
    await page.getByTestId('relay-deck-picker').click({ timeout: 60_000 });
    await expect(page.getByRole('dialog')).toContainText('damus.io', { timeout: 60_000 });
    await expect.poll(() => page.evaluate(pubkey => {
      const raw = localStorage.getItem(`obelisk-channel-prefs:${pubkey}`);
      return raw ? JSON.parse(raw).state.prefs['wss://public.obelisk.ar|general']?.notify : null;
    }, person.pkHex)).toBe('all');
    expect(await page.evaluate(() => Object.values(localStorage).some(value => String(value).includes('"version":1,"relays"')))).toBe(false);
  } finally { await context.close(); }
});
