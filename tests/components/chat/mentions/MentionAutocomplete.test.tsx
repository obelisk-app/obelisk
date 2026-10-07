import { describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import MentionAutocomplete from '@/components/chat/mentions/MentionAutocomplete';
import type { MemberInfo } from '@/utils/message-text/mentions';

const ALICE: MemberInfo = { pubkey: 'a'.repeat(64), displayName: 'Alice' };
const BOB: MemberInfo = { pubkey: 'b'.repeat(64), displayName: 'Bob', picture: 'https://example.com/bob.png' };

function mount(over: Partial<Parameters<typeof MentionAutocomplete>[0]> = {}) {
  const onSelect = vi.fn();
  const onHover = vi.fn();
  const onClose = vi.fn();
  render(
    <MentionAutocomplete
      members={[ALICE, BOB]}
      selectedIndex={0}
      onSelect={onSelect}
      onHover={onHover}
      onClose={onClose}
      {...over}
    />,
  );
  return { onSelect, onHover, onClose };
}

describe('MentionAutocomplete (desktop skin)', () => {
  it('renders nothing with no candidates', () => {
    const { container } = render(
      <MentionAutocomplete members={[]} selectedIndex={0} onSelect={() => {}} onHover={() => {}} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('labels a person with a short npub, never a hex slice', () => {
    // The drift this pins: this skin rendered `pubkey.slice(0, 8)…` while the
    // phone showed an npub. Hex is not an identity anyone can check against
    // what they were given; `shortNpubLabel` is the one sanctioned form.
    mount();
    const rows = screen.getAllByTestId('mention-option');
    expect(rows[0].textContent).toContain('Alice');
    expect(rows[0].textContent).toMatch(/npub1/);
    expect(rows[0].textContent).not.toContain('aaaaaaaa');
    expect(rows[1].textContent).not.toContain('bbbbbbbb');
  });

  it('highlights the selected row', () => {
    mount({ selectedIndex: 1 });
    const rows = screen.getAllByTestId('mention-option');
    expect(rows[0].className).not.toContain('bg-lc-border/60');
    expect(rows[1].className).toContain('bg-lc-border/60');
  });

  it('selects on click, and a mousedown only keeps the composer focused', () => {
    const { onSelect } = mount();
    const row = screen.getAllByTestId('mention-option')[1];
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(BOB);
  });

  it('selects on a touch tap and preventDefaults it, same as the phone', () => {
    const { onSelect } = mount();
    const row = screen.getAllByTestId('mention-option')[1];
    fireEvent.touchStart(row, { touches: [{ clientX: 10, clientY: 10 }] });
    const ev = createEvent.touchEnd(row, { changedTouches: [{ clientX: 12, clientY: 11 }] });
    fireEvent(row, ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(BOB);
  });

  it('closes on a pointer-down outside the list, not inside it', () => {
    const { onClose } = mount();
    fireEvent.mouseDown(screen.getAllByTestId('mention-option')[0]);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports hover with the row index and shows the picture when there is one', () => {
    const { onHover } = mount();
    const rows = screen.getAllByTestId('mention-option');
    fireEvent.mouseEnter(rows[1]);
    expect(onHover).toHaveBeenCalledWith(1);
    expect(rows[0].querySelector('img')).toBeNull();
    expect(rows[1].querySelector('img')?.getAttribute('src')).toBe(BOB.picture);
  });
});
