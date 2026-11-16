import { expect, type Page } from '@playwright/test';

/** Exercises the existing Publications UI through Concord's encrypted protocol adapter. */
export async function publicationsFlow(owner: Page, member: Page, parentName: string) {
  await owner.getByTestId('concord-channels').getByRole('button', { name: 'Server settings', exact: true }).click();
  await owner.getByTestId('server-settings-item-createChannel').click();
  await owner.getByTestId('concord-channel-name').fill('Announcements');
  await owner.getByLabel('Parent channel', { exact: true }).selectOption({ label: parentName });
  await owner.getByLabel('Publications', { exact: true }).check();
  await owner.getByTestId('concord-channel-create').click();
  await expect(owner.getByTestId('concord-channel-name')).toHaveValue('');
  await owner.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  // Nested rows use the normal channel tree. Expand the parent's disclosure if needed.
  for (const page of [owner, member]) {
    const channel = page.getByTestId('concord-channels').getByRole('button').filter({ hasText: 'Announcements' });
    if (!await channel.isVisible()) await page.getByTestId('concord-channels').getByRole('button').filter({ hasText: parentName }).click();
    await channel.click();
  }
  await owner.getByRole('button', { name: 'New publication', exact: true }).first().click();
  await owner.getByTestId('new-thread-title').fill('Encrypted announcement');
  await owner.getByTestId('new-thread-body').fill('Publication body shared between devices');
  await owner.getByTestId('new-thread-submit').click();
  await expect(owner.getByTestId('concord-messages')).toContainText('Publication body shared between devices');
  await expect(owner).toHaveURL(/&thread=[0-9a-f]{64}/);
  await member.getByText('Encrypted announcement', { exact: true }).last().click();
  await expect(member.getByTestId('concord-messages')).toContainText('Publication body shared between devices');
  await member.getByPlaceholder(/^Message #/).fill('A native encrypted publication reply');
  await member.getByPlaceholder(/^Message #/).press('Enter');
  await expect(owner.getByTestId('concord-messages')).toContainText('A native encrypted publication reply');
  await expect(member.getByTestId('concord-send-status')).toHaveCount(0, { timeout: 60_000 });
  console.log('Nested publication and encrypted comment delivered.');
  await member.reload();
  await expect(member.getByTestId('concord-messages')).toContainText('A native encrypted publication reply');
  await member.setViewportSize({ width: 390, height: 844 });
  await member.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(member.getByTestId('mobile-forum-card')).toContainText('Encrypted announcement');
  await member.getByTestId('mobile-forum-card').click();
  await member.getByPlaceholder(/^Message #/).fill('Publication reply from the phone');
  await member.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(owner.getByTestId('concord-messages')).toContainText('Publication reply from the phone');
  await expect(member.getByTestId('concord-send-status')).toHaveCount(0, { timeout: 60_000 });
  await member.setViewportSize({ width: 1440, height: 900 });
}
