import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { CustomRelayForm } from '@/components/relay/CustomRelayForm';

/** Both presentations keep the same validation and relay mutation contract. */
function mount(presentation: 'dialog' | 'sheet', methods: { addRelay?: ReturnType<typeof vi.fn>; switchRelay?: ReturnType<typeof vi.fn> } = {}) {
  const addRelay = methods.addRelay ?? vi.fn().mockResolvedValue(undefined);
  const switchRelay = methods.switchRelay ?? vi.fn().mockResolvedValue(undefined);
  const onAdded = vi.fn();
  renderWithBridge(<CustomRelayForm presentation={presentation} onAdded={onAdded} />, fakeBridge({}, { addRelay, switchRelay } as never));
  const input = screen.getByRole('textbox', { name: 'Relay URL' });
  const submit = screen.getByRole('button', { name: 'Add relay' });
  return { addRelay, switchRelay, onAdded, input, submit };
}

describe.each(['dialog', 'sheet'] as const)('%s CustomRelayForm', (presentation) => {
  it('starts on wss:// and keeps Add disabled while the field is blank', () => {
    const { input, submit } = mount(presentation);
    expect(input).toHaveValue('wss://');
    fireEvent.change(input, { target: { value: '  ' } });
    expect(submit).toBeDisabled();
  });

  it('adds the normalized address, switches to it, then reports', async () => {
    const { input, submit, addRelay, switchRelay, onAdded } = mount(presentation);
    fireEvent.change(input, { target: { value: 'relay.example' } });
    await act(async () => { fireEvent.click(submit); });
    expect(addRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(switchRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('says the address is invalid and sends nothing', async () => {
    const { input, submit, addRelay } = mount(presentation);
    fireEvent.change(input, { target: { value: 'wss://' } });
    await act(async () => { fireEvent.click(submit); });
    expect(screen.getByText('Invalid URL')).toBeInTheDocument();
    expect(addRelay).not.toHaveBeenCalled();
  });

  it('shows the busy label while adding, then the error when the add fails', async () => {
    let fail!: (e: Error) => void;
    const addRelay = vi.fn(() => new Promise<void>((_, reject) => { fail = reject; }));
    const { input, submit, onAdded } = mount(presentation, { addRelay });
    fireEvent.change(input, { target: { value: 'wss://relay.example' } });
    await act(async () => { fireEvent.submit(input.closest('form')!); });
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
    await act(async () => { fail(new Error('relay down')); });
    expect(screen.getByText('Could not add that relay.')).toBeInTheDocument();
    expect(submit).toBeEnabled();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
