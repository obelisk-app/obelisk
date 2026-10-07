import { createRef, type ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import ModalFooter from '@/components/ui/ModalFooter';

const wrap = (ui: ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('ModalFooter', () => {
  it('puts the meta text on the left and cancel then the actions on the right', () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    wrap(<ModalFooter meta="2 selected" cancel={{ onClick: onCancel }} actions={[{ label: 'Save', onClick: onSave }]} />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveClass('border-t', 'px-5', 'py-3');
    expect(screen.getByText('2 selected')).toHaveClass('text-xs', 'text-lc-muted');
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Save']);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('gives each role one look: primary green, danger red outline, secondary outline', () => {
    wrap(
      <ModalFooter
        actions={[
          { label: 'Side', tone: 'secondary' },
          { label: 'Remove', tone: 'danger' },
          { label: 'Go' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('bg-lc-green');
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('text-red-300');
    expect(screen.getByRole('button', { name: 'Side' })).toHaveClass('border-lc-border');
  });

  it('submits a form by id, and respects disabled and title', () => {
    wrap(<ModalFooter actions={[{ label: 'Save', form: 'f', disabled: true, title: 'why' }]} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('type', 'submit');
    expect(save).toHaveAttribute('form', 'f');
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('title', 'why');
  });

  it('lays an alert out as stacked buttons with no hairline, and forwards the cancel ref', () => {
    const ref = createRef<HTMLButtonElement>();
    wrap(<ModalFooter variant="alert" cancel={{ onClick: () => {}, label: 'Keep' }} cancelRef={ref} actions={[{ label: 'Delete', tone: 'danger' }]} />);
    expect(screen.getByRole('contentinfo')).toHaveClass('flex-col-reverse');
    expect(screen.getByRole('contentinfo')).not.toHaveClass('border-t');
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('bg-red-600');
  });

  it('draws a zap action as the yellow pill with the zap icon', () => {
    wrap(<ModalFooter actions={[{ label: 'Zap 21', tone: 'zap' }]} />);
    const zap = screen.getByRole('button', { name: 'Zap 21' });
    expect(zap).toHaveClass('bg-yellow-400', 'rounded-full');
    expect(zap.querySelector('svg')).not.toBeNull();
  });
});
