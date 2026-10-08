import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { CustomRelayForm } from '@/app/[locale]/app/mobile/sheets/relay/CustomRelayForm';

/**
 * What the phone add-relay tab does, written before it moved onto the common
 * form pieces: the payload, the validation message, the busy label and the
 * error line.
 */
function mount(addRelay = vi.fn().mockResolvedValue(undefined)) {
  const switchRelay = vi.fn().mockResolvedValue(undefined);
  const onAdded = vi.fn();
  renderWithBridge(<CustomRelayForm onAdded={onAdded} />, fakeBridge({}, { addRelay, switchRelay } as never));
  const input = screen.getByRole('textbox', { name: 'Relay URL' });
  return { addRelay, switchRelay, onAdded, input };
}

describe('phone CustomRelayForm', () => {
  it('adds and switches to the normalized address', async () => {
    const { input, addRelay, switchRelay, onAdded } = mount();
    expect(input).toHaveValue('wss://');
    fireEvent.change(input, { target: { value: '//relay.example' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add relay' })); });
    expect(addRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(switchRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('keeps Add disabled on a blank field and says when the address is invalid', async () => {
    const { input, addRelay } = mount();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Add relay' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'wss://' } });
    await act(async () => { fireEvent.submit(input.closest('form')!); });
    expect(screen.getByText('Invalid URL')).toBeInTheDocument();
    expect(addRelay).not.toHaveBeenCalled();
  });

  it('shows Adding… while busy and the error after a failure', async () => {
    let fail!: (e: Error) => void;
    const { input, onAdded } = mount(vi.fn(() => new Promise<void>((_, reject) => { fail = reject; })));
    fireEvent.change(input, { target: { value: 'wss://relay.example' } });
    await act(async () => { fireEvent.submit(input.closest('form')!); });
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
    await act(async () => { fail(new Error('down')); });
    expect(screen.getByText('Could not add that relay.')).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
