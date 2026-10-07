import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import ForumTagsEditor from '@/components/chat/forum/ForumTagsEditor';
import { MAX_FORUM_TAGS } from '@/constants/chat/forum';

function mount(value = [{ id: 'a1', name: 'news', emoji: null, color: null }]) {
  const onChange = vi.fn();
  render(<LocaleProvider initialLocale="en"><ForumTagsEditor value={value} onChange={onChange} /></LocaleProvider>);
  return onChange;
}

describe('ForumTagsEditor', () => {
  it('shows the empty copy with no tags', () => {
    mount([]);
    expect(screen.getByText(/No tags yet/)).toBeInTheDocument();
  });

  it('edits name and emoji through named inputs; the emoji is capped at four code units', () => {
    const onChange = mount();
    const name = screen.getByRole('textbox', { name: 'Tag name' });
    expect(name).toHaveValue('news');
    expect(name).toHaveAttribute('maxlength', '40');
    fireEvent.change(name, { target: { value: 'updates' } });
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'a1', name: 'updates', emoji: null, color: null }]);
    const emoji = screen.getByRole('textbox', { name: 'Tag emoji' });
    expect(emoji).toHaveClass('w-12', 'text-center');
    fireEvent.change(emoji, { target: { value: 'abcdef' } });
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'a1', name: 'news', emoji: 'abcd', color: null }]);
  });

  it('removes a tag', () => {
    const onChange = mount();
    fireEvent.click(screen.getByTestId('forum-tag-remove-a1'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('adds a tag, and stops at the maximum', () => {
    const onChange = mount();
    fireEvent.click(screen.getByTestId('forum-tag-add'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
  });

  it('at the maximum the add button is disabled and says why', () => {
    const full = Array.from({ length: MAX_FORUM_TAGS }, (_, i) => ({ id: `t${i}`, name: `n${i}`, emoji: null, color: null }));
    const onChange = mount(full);
    expect(screen.getByTestId('forum-tag-add')).toBeDisabled();
    fireEvent.click(screen.getByTestId('forum-tag-add'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(new RegExp(String(MAX_FORUM_TAGS)))).toBeInTheDocument();
  });
});
