import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SegmentedControl from '@/components/ui/forms/SegmentedControl';

const OPTIONS = [
  { value: 'following', label: 'Following', title: '12 follows' },
  { value: 'global', label: 'Global', testId: 'seg-global' },
  { value: 'top', label: 'Top' },
] as const;

type V = (typeof OPTIONS)[number]['value'];

function Harness({ onChange }: { onChange?: (v: V) => void }) {
  const [value, setValue] = useState<V>('following');
  return (
    <SegmentedControl<V>
      options={OPTIONS}
      value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }}
      aria-label="Feed"
    />
  );
}

describe('SegmentedControl', () => {
  it('is a named tablist with one selected tab in the segment look', () => {
    render(<Harness />);
    const list = screen.getByRole('tablist', { name: 'Feed' });
    expect(list).toHaveClass('lc-segment');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs[0]).toHaveClass('lc-segment-item', 'focus-visible:ring-2');
    expect(tabs[0]).toHaveAttribute('title', '12 follows');
    expect(screen.getByTestId('seg-global')).toBe(tabs[1]);
  });

  it('only the selected tab is in the tab order', () => {
    render(<Harness />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it('click selects', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Global' }));
    expect(onChange).toHaveBeenCalledWith('global');
    expect(screen.getByRole('tab', { name: 'Global' })).toHaveAttribute('aria-selected', 'true');
  });

  it('arrow keys wrap, Home and End jump, and focus follows', () => {
    render(<Harness />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Top' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Top' })).toHaveFocus();
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Following' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Top' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Following' })).toHaveAttribute('aria-selected', 'true');
  });

  it('fill stretches the bar and shares the width', () => {
    render(<SegmentedControl options={OPTIONS} value="top" onChange={() => {}} aria-label="Sort" fit="fill" />);
    expect(screen.getByRole('tablist')).toHaveClass('w-full');
    expect(screen.getByRole('tab', { name: 'Top' })).toHaveClass('flex-1', 'justify-center');
  });
});
