import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/components/chat/EmojiPicker', () => ({
  default: ({ onPick }: { onPick: (e: string) => void }) => (
    <div>
      <button type="button" onClick={() => onPick('🔥')}>fire</button>
      <button type="button" onClick={() => onPick(':custom:')}>custom</button>
    </div>
  ),
}));

import RoleEmojiField from '@/components/admin/relay-roles/RoleEmojiField';

const role = { id: 'mod', name: 'Moderator', tier: 1, color: '#fff', emoji: '' };
const renderEn = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('RoleEmojiField', () => {
  it('opens the picker, takes a unicode emoji and closes', () => {
    const onPick = vi.fn();
    renderEn(<RoleEmojiField role={role} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'mod emoji' }));
    expect(screen.getByTestId('role-emoji-popover-mod')).toBeInTheDocument();
    fireEvent.click(screen.getByText('fire'));
    expect(onPick).toHaveBeenCalledWith('🔥');
    expect(screen.queryByTestId('role-emoji-popover-mod')).toBeNull();
  });

  it('refuses a relay-scoped custom emoji', () => {
    const onPick = vi.fn();
    renderEn(<RoleEmojiField role={role} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'mod emoji' }));
    fireEvent.click(screen.getByText('custom'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('the backdrop closes the picker; the clear badge is an icon, not a glyph', () => {
    const onPick = vi.fn();
    renderEn(<RoleEmojiField role={{ ...role, emoji: '🛡️' }} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'mod emoji' }));
    fireEvent.click(screen.getByTestId('role-emoji-backdrop'));
    expect(screen.queryByTestId('role-emoji-popover-mod')).toBeNull();
    const clear = screen.getByRole('button', { name: 'Clear mod emoji' });
    expect(clear.querySelector('svg')).not.toBeNull();
    expect(clear).not.toHaveTextContent('✕');
    fireEvent.click(clear);
    expect(onPick).toHaveBeenCalledWith('');
  });
});
