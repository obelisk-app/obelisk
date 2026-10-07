import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { NewThreadSheet } from '@/app/[locale]/app/mobile/sheets/forum/NewThreadSheet';

const TAGS = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id.toUpperCase(), emoji: id === 'a' ? '🅰' : null, color: null }));

describe('NewThreadSheet tag picker', () => {
  it('toggles tags and disables the rest once five are picked', () => {
    renderWithBridge(
      <NewThreadSheet
        forumGroupId="rly/forum" forumTags={TAGS} initialTitle="" isPublic isHidden={false} isRestricted={false} isOpen
        close={vi.fn()} onCreated={vi.fn()}
      />,
      fakeBridge(),
    );
    const chip = (id: string) => screen.getByTestId(`mobile-new-thread-tag-${id}`);
    expect(chip('a')).toHaveTextContent('🅰');
    fireEvent.click(chip('a'));
    expect(chip('a')).toHaveAttribute('aria-pressed', 'true');
    for (const id of ['b', 'c', 'd', 'e']) fireEvent.click(chip(id));
    expect(chip('f')).toBeDisabled();
    expect(chip('f').style.opacity).toBe('0.4');
    expect(chip('a')).not.toBeDisabled();
    fireEvent.click(chip('a'));
    expect(chip('a')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('f')).not.toBeDisabled();
  });
});
