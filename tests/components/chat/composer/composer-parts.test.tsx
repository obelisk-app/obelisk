import { fireEvent, render, renderHook, act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { AttachmentMenu } from '@/components/chat/composer/AttachmentMenu';
import { useFileDrag } from '@/hooks/chat/composer/useFileDrag';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

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
    expect(input.value).toBe('');
  });

  it('hands nothing over when the picker closes empty', () => {
    const onFiles = vi.fn();
    const { container } = renderLocalized(<AttachmentMenu onFiles={onFiles} onContact={() => {}} onNewSticker={() => {}} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [] } });
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('a menu entry closes the menu and opens its picker', () => {
    const { container } = renderLocalized(<AttachmentMenu onFiles={() => {}} onContact={() => {}} onNewSticker={() => {}} />);
    const camera = container.querySelectorAll('input[type="file"]')[2] as HTMLInputElement;
    const click = vi.spyOn(camera, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Camera' }));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('AttachmentMenu contact entry', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a key, closes the menu and passes the trimmed answer on', () => {
    const prompt = vi.fn(() => ' npub1xyz ');
    vi.stubGlobal('prompt', prompt);
    const onContact = vi.fn();
    renderLocalized(<AttachmentMenu onFiles={() => {}} onContact={onContact} onNewSticker={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Contact' }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(onContact).toHaveBeenCalledWith('npub1xyz');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('passes nothing on when the prompt is cancelled', () => {
    vi.stubGlobal('prompt', vi.fn(() => null));
    const onContact = vi.fn();
    renderLocalized(<AttachmentMenu onFiles={() => {}} onContact={onContact} onNewSticker={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Contact' }));
    expect(onContact).not.toHaveBeenCalled();
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
