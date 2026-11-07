/** Offline media editing: every relay socket is intercepted, including publishes. */
import { test, expect } from '@playwright/test';
import { finalizeEvent, matchFilters, type Event, type Filter } from 'nostr-tools';
import { generateIdentity, nsecSession, seedSession } from './lib';

for (const width of [1280, 390]) {
  test(`media packs merge, save, and reload at ${width}px`, async ({ page, context }) => {
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => console.log('Browser error:', error.message));
    await page.setViewportSize({ width, height: 844 });
    const identity = generateIdentity();
    const secret = Uint8Array.from(identity.skHex.match(/../g)!, (byte) => parseInt(byte, 16));
    const relay = 'wss://media.e2e.test';
    const events: Event[] = ['A', 'B'].map((name, index) => finalizeEvent({ kind: 30030,
      created_at: 10, content: '', tags: [['d', name], ['title', `Pack ${name}`],
        ['emoji', 'shared', 'https://media.e2e.test/shared.png'],
        ['media', 'shared', 'sticker'], ['emoji', 'unique', `https://media.e2e.test/${index}.png`], ['media', 'unique', 'emoji']],
    }, secret));
    const published: Event[] = [];
    await seedSession(context, nsecSession(identity, relay));
    await context.addInitScript((pubkey) => {
      localStorage.setItem('obelisk:analytics-consent', 'denied');
      const hints = JSON.stringify({ state: { seen: [], muted: true }, version: 1 });
      localStorage.setItem('obelisk:hints', hints);
      localStorage.setItem(`obelisk:hints:${pubkey}`, hints);
    }, identity.pkHex);
    await page.route('https://media.e2e.test/**', (route) => route.fulfill({
      contentType: 'application/nostr+json', body: JSON.stringify({ pubkey: identity.pkHex, supported_nips: [29] }),
    }));
    await page.routeWebSocket(/^wss:\/\//, (socket) => {
      const subscriptions = new Map<string, Filter[]>();
      socket.onMessage((data) => {
        const [type, id, ...rest] = JSON.parse(String(data));
        if (type === 'REQ') {
          subscriptions.set(id, rest);
          for (const event of events.filter((event) => matchFilters(rest, event))) socket.send(JSON.stringify(['EVENT', id, event]));
          socket.send(JSON.stringify(['EOSE', id]));
        } else if (type === 'EVENT') {
          const event = id as Event;
          events.push(event); published.push(event);
          socket.send(JSON.stringify(['OK', event.id, true, '']));
          for (const [subscription, filters] of subscriptions) {
            if (matchFilters(filters, event)) socket.send(JSON.stringify(['EVENT', subscription, event]));
          }
        } else if (type === 'CLOSE') subscriptions.delete(id);
      });
    });
    const openLibrary = async () => {
      await page.goto(width < 600 ? '/app?s=settings-prefs' : '/app', { timeout: 120000 });
      await expect(page.getByTestId('rehydrating-screen')).toBeHidden({ timeout: 30000 });
      if (width < 600) await page.getByTestId('mobile-media-library').click();
      else {
        await page.getByTestId('user-settings-button').click();
        await page.getByTestId('desktop-media-library').click();
      }
    };
    await openLibrary();
    console.log('Media library opened');
    await page.getByRole('button', { name: 'Merge / copy items', exact: true }).click();
    const transfer = page.getByTestId('media-transfer');
    await transfer.getByRole('button', { name: 'Pack A (2)', exact: true }).click();
    await transfer.getByRole('button', { name: 'Pack B (2)', exact: true }).click();
    await transfer.getByRole('button', { name: 'Preview merge', exact: true }).click();
    const editor = page.getByTestId('media-pack-editor');
    await expect(editor.getByRole('textbox', { name: /Item \d+ URL/ })).toHaveCount(3);
    await editor.getByRole('textbox', { name: 'Pack name', exact: true }).fill('Merged pack');
    await editor.getByRole('button', { name: 'Save pack', exact: true }).click();
    await expect(editor).toBeHidden();
    expect(new Set(published.filter((event) => event.kind === 30030).map((event) => event.id)).size).toBe(1);
    await openLibrary();
    await page.getByRole('button', { name: 'My packs', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('heading', { name: 'Merged pack', exact: true })).toBeVisible();
  });
}
