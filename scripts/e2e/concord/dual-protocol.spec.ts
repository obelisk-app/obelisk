import { test, expect } from '@playwright/test';
import { createTestPersonas } from '../persona-identity';
import { nsecSession, seedSession } from '../lib';
import { readFile } from 'node:fs/promises';

// Session seeding carries private keys. Never capture Playwright API arguments or browser storage.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('two accounts create, join, exchange encrypted messages and return to NIP-29', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const personas = createTestPersonas();
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  ownerContext.setDefaultTimeout(30_000);
  memberContext.setDefaultTimeout(30_000);
  try {
    await seedSession(ownerContext, nsecSession(personas.owner));
    await seedSession(memberContext, nsecSession(personas.member));
    const owner = await ownerContext.newPage();
    const member = await memberContext.newPage();
    owner.on('pageerror', error => console.error(error.message.replace(/nsec1[a-z0-9]+|\b[0-9a-f]{64}\b/g, '[redacted]')));
    owner.on('console', message => { if (message.type() === 'error' && message.text().startsWith('Concord startup:')) console.error(message.text()); });
    await owner.goto('/app');
    await owner.getByTestId('analytics-consent').getByRole('button', { name: "Don't allow", exact: true }).click();
    await owner.getByTestId('concord-open').first().click({ timeout: 60_000 });
    await expect(owner.getByTestId('concord-workspace')).toBeVisible({ timeout: 30_000 });
    await owner.getByTestId('concord-name').fill(`Obelisk E2E ${Date.now()}`, { timeout: 60_000 });
    await owner.getByTestId('concord-create').click();
    await expect(owner.getByTestId('concord-room')).toBeVisible({ timeout: 90_000 });
    await owner.getByTestId('concord-create-invite').click();
    await expect(owner.getByTestId('concord-invite-link')).toBeVisible({ timeout: 60_000 });
    const invitation = await owner.getByTestId('concord-invite-link').inputValue();
    await member.goto(invitation);
    await member.getByTestId('analytics-consent').getByRole('button', { name: "Don't allow", exact: true }).click();
    await expect(member.getByTestId('concord-invite-input')).not.toHaveValue('', { timeout: 60_000 });
    await member.getByTestId('concord-join').click();
    await expect(member.getByTestId('concord-room')).toBeVisible({ timeout: 60_000 });
    const message = `Encrypted E2E ${Date.now()}`;
    await owner.getByTestId('concord-message-input').fill(message);
    await owner.getByTestId('concord-send').click();
    await expect(member.getByTestId('concord-messages')).toContainText(message, { timeout: 30_000 });
    await member.getByTestId('concord-message-input').fill(`${message} reply`);
    await member.getByTestId('concord-send').click();
    await expect(owner.getByTestId('concord-messages')).toContainText(`${message} reply`, { timeout: 30_000 });
    const attachment = `Private attachment ${Date.now()}`;
    await owner.getByLabel('Encrypted attachments (25 MB each)', { exact: true }).setInputFiles({ name: 'private.txt', mimeType: 'text/plain', buffer: Buffer.from(attachment) });
    await owner.getByTestId('concord-message-input').fill('Encrypted attachment test');
    await owner.getByTestId('concord-send').click();
    const downloadReady = member.waitForEvent('download', { timeout: 60_000 });
    await member.getByRole('button', { name: 'Download encrypted attachment', exact: true }).first().click({ timeout: 60_000 });
    const download = await downloadReady;
    const file = await download.path();
    expect(file).not.toBeNull();
    expect(await readFile(file!, 'utf8')).toBe(attachment);
    await member.reload();
    await member.getByTestId('concord-open').first().click({ timeout: 30_000 });
    await member.getByTestId('concord-community').first().click({ timeout: 60_000 });
    await expect(member.getByTestId('concord-messages')).toContainText(message, { timeout: 30_000 });
    await member.getByTestId('concord-workspace').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(member.getByTestId('concord-workspace')).toBeHidden();
    await expect(member.getByTestId('concord-open').first()).toBeVisible();
    const plaintextLeak = await member.evaluate(text => Object.values(localStorage).some(value => String(value).includes(text)), message);
    expect(plaintextLeak).toBe(false);
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});
