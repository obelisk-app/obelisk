import { expect, type Page } from '@playwright/test';

/** An ordinary member receives a real Grant, creates on mobile, then loses it on opt-out. */
export async function memberChannelsFlow(owner: Page, member: Page) {
  await owner.setViewportSize({ width: 1440, height: 900 });
  await member.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(member.getByTestId('mobile-create-channel-btn')).toHaveCount(0);
  await owner.getByTestId('concord-channels').getByRole('button', { name: 'Server settings', exact: true }).click();
  await owner.getByTestId('server-settings-item-roles').click();
  await owner.getByTestId('concord-member-channels').check();
  await owner.getByTestId('concord-member-channels-save').click();
  await expect(member.getByTestId('mobile-create-channel-btn')).toBeVisible({ timeout: 60_000 });
  await member.getByTestId('mobile-create-channel-btn').click();
  await member.getByTestId('concord-channel-name').fill('member-created');
  await member.getByTestId('concord-channel-create').click();
  await expect(member.getByTestId('concord-channel-name')).toHaveValue('', { timeout: 30_000 });
  await expect(owner.getByTestId('concord-channels').getByRole('button').filter({ hasText: 'member-created' })).toBeVisible({ timeout: 30_000 });
  await member.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
  await member.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
  await expect(member.getByPlaceholder('Message #member-created')).toBeVisible();
  await member.getByPlaceholder('Message #member-created').fill('Created by a member on mobile');
  await member.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(member.getByTestId('concord-send-status')).toHaveCount(0, { timeout: 60_000 });
  await member.getByRole('button', { name: 'Back', exact: true }).click();
  await owner.getByTestId('concord-member-channels').uncheck();
  await owner.getByTestId('concord-member-channels-save').click();
  await expect(member.getByTestId('mobile-create-channel-btn')).toHaveCount(0, { timeout: 30_000 });
  await expect(member.getByTestId('concord-channels').getByRole('button').filter({ hasText: 'member-created' })).toBeVisible();
  await owner.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  console.log('Member mobile channel creation and permission revocation passed.');
}
