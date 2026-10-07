import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TextArea from '@/components/ui/forms/TextArea';

describe('TextArea', () => {
  it('shares the input surface and resizes vertically by default', () => {
    render(<TextArea placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el.tagName).toBe('TEXTAREA');
    expect(el).toHaveClass('rounded-lg', 'bg-lc-black', 'resize-y');
  });

  it('resize none', () => {
    render(<TextArea resize="none" placeholder="p" />);
    expect(screen.getByPlaceholderText('p')).toHaveClass('resize-none');
  });

  it('labels and describes', () => {
    render(<TextArea label="About" hint="Markdown ok" />);
    const el = screen.getByLabelText('About');
    expect(el).toHaveAccessibleDescription('Markdown ok');
  });
});

describe('TextArea resize both', () => {
  it('adds no resize class', () => {
    render(<TextArea resize="both" placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).not.toHaveClass('resize-y');
    expect(el).not.toHaveClass('resize-none');
  });
});

describe('TextArea variants', () => {
  it('lg is the rounded-xl surface', () => {
    render(<TextArea size="lg" resize="none" placeholder="p" />);
    expect(screen.getByPlaceholderText('p')).toHaveClass('rounded-xl', 'px-3', 'py-2.5', 'resize-none');
  });

  it('mobile is the stylesheet class alone, with no resize class', () => {
    render(<TextArea variant="mobile" placeholder="p" />);
    expect(screen.getByPlaceholderText('p').className).toBe('setup-textarea');
  });

  it('bare keeps only the caller classes plus the resize axis', () => {
    render(<TextArea variant="bare" resize="none" className="bg-transparent" placeholder="p" />);
    expect(screen.getByPlaceholderText('p').className).toBe('resize-none bg-transparent');
  });

  it('invalid turns the border red', () => {
    render(<TextArea invalid placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(el).toHaveClass('border-red-500');
  });
});

describe('TextArea height', () => {
  function stubMetrics(el: HTMLElement, scrollHeight: number) {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  }

  it('fixed is the default and leaves the inline height alone', () => {
    render(<TextArea placeholder="p" />);
    expect(screen.getByPlaceholderText('p').style.height).toBe('');
  });

  it('auto sizes to the content on input and turns resizing off', () => {
    render(<TextArea height="auto" placeholder="p" style={{ lineHeight: '20px', padding: '8px 0' }} />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveClass('resize-none');
    stubMetrics(el, 96);
    fireEvent.input(el, { target: { value: 'a\nb\nc\nd' } });
    expect(el.style.height).toBe('96px');
    expect(el.style.overflowY).toBe('hidden');
  });

  it('auto stops at maxRows and scrolls past it', () => {
    render(<TextArea height="auto" maxRows={3} placeholder="p" style={{ lineHeight: '20px', padding: '8px 0' }} />);
    const el = screen.getByPlaceholderText('p');
    stubMetrics(el, 400);
    fireEvent.input(el, { target: { value: 'long' } });
    expect(el.style.height).toBe('76px');
    expect(el.style.overflowY).toBe('auto');
  });

  it('auto re-measures when the controlled value changes and still calls onInput', () => {
    const onInput = vi.fn();
    const { rerender } = render(<TextArea height="auto" value="a" onChange={() => {}} onInput={onInput} placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    stubMetrics(el, 120);
    rerender(<TextArea height="auto" value="a\nb" onChange={() => {}} onInput={onInput} placeholder="p" />);
    expect(el.style.height).toBe('120px');
    fireEvent.input(el);
    expect(onInput).toHaveBeenCalledTimes(1);
  });
});
