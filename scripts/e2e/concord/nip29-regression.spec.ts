import { test, expect } from '@playwright/test';
import { createTestPersonas } from '../persona-identity';
import { findChannelByName, nsecSession, seedSession, sendMessageInActiveChannel } from '../lib';
import { startNip29Fixture } from './relay-fixture';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('NIP-29 still delivers messages between two accounts beside the Concord entry', async ({ browser, baseURL }) => {
  const personas = createTestPersonas();
  const relay = await startNip29Fixture(personas.owner, personas.member);
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  try {
    await relay.route(ownerContext);
    await relay.route(memberContext);
    await seedSession(ownerContext, nsecSession(personas.owner, relay.url));
    await seedSession(memberContext, nsecSession(personas.member, relay.url));
    const owner = await ownerContext.newPage();
    const member = await memberContext.newPage();
    for (const page of [owner, member]) {
      await page.goto('/app');
      await page.getByTestId('analytics-consent').getByRole('button', { name: "Don't allow", exact: true }).click();
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
    await member.reload();
    await expect(member.getByText(content, { exact: true })).toBeVisible();
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
    await relay.stop();
  }
});
