import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import BackButton from '@/app/app/mobile/BackButton';
import EmojiSheet from '@/app/app/mobile/EmojiSheet';
import SheetActions from '@/app/app/mobile/sheets/SheetActions';

const en = (node: React.ReactNode) => render(<LocaleProvider initialLocale="en">{node}</LocaleProvider>);

describe('mobile BackButton', () => {
  it('is the stylesheet back button with the shared chevron and a translated name', () => {
    const onClick = vi.fn();
    en(<BackButton onClick={onClick} data-testid="b" />);
    const button = screen.getByRole('button', { name: 'Back' });
    expect(button).toHaveClass('back-btn');
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelector('path')).toHaveAttribute('d', 'm15 18-6-6 6-6');
    expect(button.querySelector('svg')).toHaveAttribute('stroke-width', '2');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('takes a custom label and can be disabled', () => {
    const onClick = vi.fn();
    en(<BackButton onClick={onClick} label="Leave" disabled />);
    const button = screen.getByRole('button', { name: 'Leave' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('SheetActions', () => {
  it('renders the primary and the cancel as siblings with the stylesheet classes', () => {
    const save = vi.fn();
    const cancel = vi.fn();
    const { container } = en(
      <div data-testid="sheet">
        <SheetActions primary={{ label: 'Save', onClick: save, testId: 'save' }} onCancel={cancel} />
      </div>,
    );
    const sheet = screen.getByTestId('sheet');
    expect(sheet.children).toHaveLength(2);
    expect(screen.getByTestId('save')).toHaveClass('btn-primary');
    fireEvent.click(screen.getByTestId('save'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.btn-cancel')).toHaveAttribute('type', 'button');
  });

  it('shows the busy label and disables the primary while busy', () => {
    en(<SheetActions primary={{ label: 'Save', busyLabel: 'Saving…', busy: true, onClick: vi.fn() }} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('can say Close and carry an extra class, with no primary', () => {
    const { container } = en(<SheetActions onCancel={vi.fn()} dismiss="close" cancelClassName="relay-menu-close" />);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('btn-cancel', 'relay-menu-close');
  });
});

describe('EmojiSheet', () => {
  it('closes on a tap outside the sheet but not inside it', () => {
    const onClose = vi.fn();
    const { container } = render(<EmojiSheet onClose={onClose}><span>picker</span></EmojiSheet>);
    fireEvent.click(screen.getByText('picker'));
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('.emoji-sheet .sheet-handle')).not.toBeNull();
    fireEvent.click(container.querySelector('.emoji-sheet-host')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
