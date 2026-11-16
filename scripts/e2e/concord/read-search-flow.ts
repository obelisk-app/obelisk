import { nip19 } from 'nostr-tools';
import { expect, type Page } from '@playwright/test';

/** Real relay delivery into a background channel, local search and sealed read recovery. */
export async function readSearchFlow(owner: Page, member: Page, channelName: string, memberPubkey: string) {
  const text = `Unread search probe ${Date.now()}`;
  await owner.getByPlaceholder(/^Message #/).fill(`${text} nostr:${nip19.npubEncode(memberPubkey)}`);
  await owner.getByPlaceholder(/^Message #/).press('Enter');
  const row = member.locator('[data-testid^="channel-row-concord:"]').filter({ has: member.getByText(channelName, { exact: true }) });
  await expect(row.getByLabel('1 unread message', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(row.getByLabel('1 mention or reply', { exact: true })).toBeVisible();
  await member.getByRole('button', { name: 'Search', exact: true }).click();
  await member.getByRole('searchbox').fill(text);
  await expect(member.getByTestId('concord-search-hit')).toContainText(text);
  await member.getByTestId('concord-search-hit').click();
  await member.bringToFront();
  await expect(member.getByTestId('concord-messages')).toContainText(text);
  await member.getByTestId('concord-channels').getByRole('button').filter({ hasText: /general/ }).first().click();
  await expect(row.getByLabel('1 unread message', { exact: true })).toHaveCount(0);
  await member.reload();
  await expect(member.getByTestId('concord-channels')).toContainText(channelName);
  await expect(row.getByLabel('1 unread message', { exact: true })).toHaveCount(0);
}
