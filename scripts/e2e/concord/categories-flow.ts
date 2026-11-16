import { expect, type Page } from '@playwright/test';

export async function categoriesFlow(owner: Page, member: Page, firstChannel: string, secondChannel: string) {
  await owner.getByTestId('concord-channels').getByRole('button', { name: 'Server settings', exact: true }).click();
  await owner.getByTestId('server-settings-item-channels').click();
  const dialog = owner.getByRole('dialog');
  await expect(dialog).toContainText('Categories & order');
  await expect(dialog).not.toContainText('NIP-78');
  for (const name of ['Team', 'Archive', 'Empty category']) {
    await dialog.getByPlaceholder('e.g. General, Trading, Voice').fill(name);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  }
  const category = (name: string) => dialog.getByTestId(/^layout-category-/).filter({ has: owner.locator(`input[value="${name}"]`) });
  const archiveId = (await category('Archive').getAttribute('data-testid'))!.replace('layout-category-', '');
  const teamId = (await category('Team').getAttribute('data-testid'))!.replace('layout-category-', '');
  await dialog.getByRole('combobox', { name: `Category for ${firstChannel}`, exact: true }).selectOption({ label: 'Team' });
  await dialog.getByRole('combobox', { name: `Category for ${secondChannel}`, exact: true }).selectOption({ label: 'Archive' });
  await category('Empty category').getByRole('button', { name: 'Move up', exact: true }).click();
  await category('Empty category').getByRole('button', { name: 'Move up', exact: true }).click();
  await category('Team').getByRole('textbox', { name: 'Category name', exact: true }).fill('Daily chat');
  await dialog.screenshot({ path: '/tmp/obelisk-concord-categories-desktop.png' });
  await dialog.getByRole('button', { name: 'Publish layout', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const sidebar = member.getByTestId('concord-channels');
  await expect(sidebar.getByRole('button', { name: /Empty category/ })).toBeVisible();
  await sidebar.getByRole('button', { name: /Daily chat/ }).click();
  await expect(sidebar.getByRole('button').filter({ hasText: firstChannel })).toHaveCount(0);
  await sidebar.getByRole('button', { name: /Daily chat/ }).click();
  await expect(sidebar.getByRole('button').filter({ hasText: firstChannel })).toBeVisible();
  await member.reload();
  await expect(sidebar.getByRole('button', { name: /Empty category/ })).toBeVisible();
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.getByRole('button', { name: 'Back', exact: true }).click();
  await owner.locator('.action-menu').click();
  await owner.getByRole('button', { name: 'Categories & order', exact: true }).click();
  await expect(owner.getByRole('dialog')).not.toContainText('NIP-78');
  await owner.getByTestId(`mobile-layout-category-${teamId}`).getByRole('textbox', { name: 'Category name', exact: true }).fill('Daily discussion');
  await owner.getByTestId(`mobile-layout-category-${archiveId}`).getByRole('button', { name: 'Delete category', exact: true }).click();
  await expect.poll(async () => { const box = await owner.getByRole('dialog').boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(844);
  await owner.getByRole('dialog').screenshot({ path: '/tmp/obelisk-concord-categories-mobile.png' });
  await owner.getByTestId('mobile-categories-save').click();
  await expect(owner.getByRole('dialog')).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: /Daily discussion/ })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Archive/ })).toHaveCount(0);
  await expect(sidebar.getByRole('button').filter({ hasText: secondChannel })).toBeVisible();
  await owner.setViewportSize({ width: 1440, height: 900 });
  console.log('Shared category editors: empty categories, reorder, assign, rename, collapse, reload and mobile delete passed.');
}
