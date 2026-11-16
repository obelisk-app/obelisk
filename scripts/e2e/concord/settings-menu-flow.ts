import { expect, type Page } from '@playwright/test';

/** Every mobile community-menu destination must open its actual editor or member list. */
export async function mobileSettingsFlow(owner: Page) {
  for (const [label, target] of [
    ['Edit branding', 'concord-community-title'],
    ['Roles & ranks', 'concord-role-name'],
  ]) {
    await owner.locator('.action-menu').click();
    await owner.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
    await expect(owner.getByTestId(target)).toBeVisible();
    await owner.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
    await owner.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
  }
  await owner.locator('.action-menu').click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Invite people', exact: true }).click();
  await owner.getByTestId('concord-create-invite').click();
  await expect(owner.getByTestId('concord-invite-link')).not.toHaveValue('');
  await owner.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
  await owner.locator('.action-menu').click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Admins & members', exact: true }).click();
  await expect(owner.getByRole('dialog').getByTestId('concord-member')).toHaveCount(2);
  await owner.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
}
