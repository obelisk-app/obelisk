import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CopyButton from '@/components/ui/CopyButton';

describe('CopyButton', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('copies, flips to the tick and announces, then resets after 2000 ms', async () => {
    const onCopied = vi.fn();
    render(<CopyButton text="npub1abc" label="Copy npub" copiedLabel="Copied" onCopied={onCopied} />);
    const el = screen.getByRole('button', { name: 'Copy npub' });
    expect(el).toHaveAttribute('type', 'button');
    await act(async () => { fireEvent.click(el); });
    expect(writeText).toHaveBeenCalledWith('npub1abc');
    expect(onCopied).toHaveBeenCalledTimes(1);
    // The tick must be the element carrying the green, with no other text
    // colour beside it. Asserting the button merely *had* text-lc-green passed
    // while the ghost variant's grey won in the browser.
    const tick = screen.getByRole('button', { name: 'Copied' }).querySelector('svg')!;
    const colours = tick.getAttribute('class')!.split(/\s+/).filter((c) => /^text-lc-/.test(c));
    expect(colours).toEqual(['text-lc-green']);
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
    act(() => { vi.advanceTimersByTime(1999); });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('button', { name: 'Copy npub' })).toBeInTheDocument();
  });

  it('a refused clipboard does not claim success', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const onCopied = vi.fn();
    render(<CopyButton text="x" label="Copy" copiedLabel="Copied" onCopied={onCopied} />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(onCopied).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('md is the toolbar size', () => {
    render(<CopyButton text="x" label="Copy" copiedLabel="Copied" size="md" />);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('p-2');
    expect(el.querySelector('svg')).toHaveAttribute('width', '16');
  });
});
