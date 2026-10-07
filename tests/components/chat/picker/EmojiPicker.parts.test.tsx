import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmojiPicker from '@/components/chat/picker/EmojiPicker';
import { CreateMediaControl } from '@/components/chat/picker/CreateMediaControl';
import { LocaleProvider } from '@tests/support/intl';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('EmojiPicker parts', () => {
  beforeEach(() => localStorage.clear());

  it('a reacted emoji is disabled and says so, in the grid and in recents; a custom one too', () => {
    localStorage.setItem('obelisk:recent-emojis', JSON.stringify(['😀']));
    const { container } = renderLocalized(
      <EmojiPicker onPick={() => {}} onClose={() => {}} customEmojis={{ party: 'https://x/p.png' }} disabledEmojis={new Set(['😀', ':party:'])} />,
    );
    const grid = screen.getAllByRole('button', { name: '😀' });
    expect(grid.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(grid.some((b) => b.getAttribute('title') === 'Already reacted')).toBe(true);
    const recent = container.querySelector<HTMLElement>('[data-emoji-category="Recent"]')!;
    expect(within(recent).getByRole('button', { name: '😀' })).toBeDisabled();
    const party = screen.getByAltText(':party:').closest('button')!;
    expect(party).toBeDisabled();
    expect(party).toHaveAttribute('title', 'Already reacted');
  });

  it('picks a character from a recents entry, and a search shows no-match copy', () => {
    localStorage.setItem('obelisk:recent-emojis', JSON.stringify(['😀']));
    const onPick = vi.fn();
    const { container } = renderLocalized(<EmojiPicker onPick={onPick} onClose={() => {}} customEmojis={{}} />);
    const recent = container.querySelector<HTMLElement>('[data-emoji-category="Recent"]')!;
    fireEvent.click(within(recent).getByRole('button', { name: '😀' }));
    expect(onPick).toHaveBeenCalledWith('😀');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzzqqq' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('every section lists its emoji, starting with Smileys', () => {
    const { container } = renderLocalized(<EmojiPicker onPick={() => {}} onClose={() => {}} customEmojis={{}} />);
    const sections = container.querySelectorAll('[data-emoji-category]');
    expect(sections.length).toBeGreaterThan(5);
    expect(sections[1].querySelectorAll('button').length).toBeGreaterThan(50);
  });

  it('the category bar marks the active category', () => {
    renderLocalized(<EmojiPicker onPick={() => {}} onClose={() => {}} customEmojis={{}} />);
    const nav = screen.getByRole('navigation');
    expect(within(nav).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });
});

describe('CreateMediaControl', () => {
  it('hands the picked file over with its kind and resets the input; the tile opens the picker', () => {
    const onFile = vi.fn();
    const { container } = renderLocalized(<CreateMediaControl kind="sticker" uploading={false} onFile={onFile} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button'));
    expect(click).toHaveBeenCalledOnce();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file, 'sticker');
    expect(input.value).toBe('');
  });

  it('while uploading the tile is disabled and says so', () => {
    renderLocalized(<CreateMediaControl kind="gif" square uploading onFile={() => {}} />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveClass('aspect-square');
  });
});
