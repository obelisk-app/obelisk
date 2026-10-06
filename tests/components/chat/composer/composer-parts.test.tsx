import { fireEvent, render, renderHook, act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { AttachmentMenu, promptForContact } from '@/components/chat/composer/AttachmentMenu';
import { useFileDrag } from '@/hooks/chat/composer/useFileDrag';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('promptForContact', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the trimmed answer, or null when blank or cancelled', () => {
    const prompt = vi.fn(() => '  npub1abc  ');
    vi.stubGlobal('prompt', prompt);
    expect(promptForContact('Which key?')).toBe('npub1abc');
    expect(prompt).toHaveBeenCalledWith('Which key?');
    vi.stubGlobal('prompt', vi.fn(() => '   '));
    expect(promptForContact('Which key?')).toBeNull();
    vi.stubGlobal('prompt', vi.fn(() => null));
    expect(promptForContact('Which key?')).toBeNull();
  });
});

describe('AttachmentMenu file inputs', () => {
  it('gives each hidden picker a name and closes on a press outside', () => {
    const { container } = renderLocalized(
      <div>
        <AttachmentMenu onFiles={() => {}} onContact={() => {}} onNewSticker={() => {}} />
        <p data-testid="elsewhere">x</p>
      </div>,
    );
    const inputs = Array.from(container.querySelectorAll('input[type="file"]'));
    expect(inputs.map((input) => input.getAttribute('aria-label'))).toEqual(['Photos & videos', 'Document', 'Camera']);
    expect(inputs[2]).toHaveAttribute('capture', 'environment');
    expect(inputs[0]).toHaveAttribute('multiple');
    expect(inputs[2]).not.toHaveAttribute('multiple');

    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('elsewhere'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('hands picked files over and resets the input', () => {
    const onFiles = vi.fn();
    const { container } = renderLocalized(<AttachmentMenu onFiles={onFiles} onContact={() => {}} onNewSticker={() => {}} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });
});

describe('useFileDrag', () => {
  const dragEvent = (types: string[], files: File[] = []) => ({
    preventDefault: vi.fn(),
    dataTransfer: { types, files, dropEffect: 'none' },
  }) as unknown as React.DragEvent<HTMLDivElement>;

  it('stays active across nested enter/leave and ignores non-file drags', () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() => useFileDrag(onFiles));
    act(() => result.current.handlers.onDragEnter(dragEvent(['text/plain'])));
    expect(result.current.active).toBe(false);
    act(() => result.current.handlers.onDragEnter(dragEvent(['Files'])));
    act(() => result.current.handlers.onDragEnter(dragEvent(['Files'])));
    act(() => result.current.handlers.onDragLeave(dragEvent(['Files'])));
    expect(result.current.active).toBe(true);
    act(() => result.current.handlers.onDragLeave(dragEvent(['Files'])));
    expect(result.current.active).toBe(false);
  });

  it('drops nothing while disabled', () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() => useFileDrag(onFiles, true));
    act(() => result.current.handlers.onDragEnter(dragEvent(['Files'])));
    expect(result.current.active).toBe(false);
    act(() => result.current.handlers.onDrop(dragEvent(['Files'], [new File(['x'], 'a.txt')])));
    expect(onFiles).not.toHaveBeenCalled();
  });
});
