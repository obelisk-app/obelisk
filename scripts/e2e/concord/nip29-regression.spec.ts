import { test, expect } from '@playwright/test';
import { createTestPersonas } from '../persona-identity';
import { findChannelByName, nsecSession, seedSession, sendMessageInActiveChannel } from '../lib';
import { startNip29Fixture } from './relay-fixture';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('NIP-29 still delivers messages between two accounts beside the Concord entry', async ({ browser, baseURL }) => {
  const personas = createTestPersonas();
  const relay = await startNip29Fixture(personas.owner, personas.member);
  const ownerContext = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const memberContext = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  ownerContext.setDefaultTimeout(30_000);
  memberContext.setDefaultTimeout(30_000);
  try {
    await relay.route(ownerContext);
    await relay.route(memberContext);
    await seedSession(ownerContext, nsecSession(personas.owner, relay.url));
    await seedSession(memberContext, nsecSession(personas.member, relay.url));
    const owner = await ownerContext.newPage();
    const member = await memberContext.newPage();
    for (const page of [owner, member]) {
      await page.goto('/app');
      await page.getByTestId('analytics-consent').getByRole('button', { name: "Don't allow", exact: true }).click({ noWaitAfter: true });
      await page.addLocatorHandler(page.getByTestId('hint-callout'), () => page.getByTestId('hint-mute').click());
      await page.getByRole('button').filter({ hasText: /^#/ }).first().waitFor({ state: 'visible', timeout: 45_000 }).catch(async error => {
        console.error('NIP-29 main state:', await page.locator('main').innerText());
        throw error;
      });
      const channel = await findChannelByName(page, 'concord-regression');
      await channel.click();
      await expect(page.locator('[data-tour=rail-add-relay]')).toBeVisible();
    }
    const content = `NIP-29 regression ${Date.now()}`;
    await sendMessageInActiveChannel(owner, content);
    await expect(member.getByText(content, { exact: true })).toBeVisible();
    await sendMessageInActiveChannel(member, `${content} reply`);
    await expect(owner.getByText(`${content} reply`, { exact: true })).toBeVisible();
    await owner.getByTestId('sidebar-header').getByRole('button', { name: 'Server settings', exact: true }).click();
    await owner.getByTestId('server-settings-item-invite').click();
    await expect(owner.getByTestId('relay-invite-settings')).toBeVisible();
    await expect(owner.getByTestId('relay-invite-relay-picker')).toHaveValue(relay.url);
    await owner.getByTestId('relay-invite-label').fill('Community settings test');
    await owner.getByTestId('relay-invite-create').click();
    await expect(owner.getByTestId('relay-invite-new-link')).toBeVisible();
    await member.reload();
    await expect(member.getByText(content, { exact: true })).toBeVisible();
  } finally {
    await relay.stop();
    await Promise.allSettled([ownerContext.close(), memberContext.close()]);
  }
});
