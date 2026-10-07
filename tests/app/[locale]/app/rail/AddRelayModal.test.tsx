import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => ({
  byUrl: {
    'wss://one.example': { name: 'One', description: 'The first relay', icon: 'https://one.example/i.png' },
  } as Record<string, { name?: string; description?: string; icon?: string }>,
}));
vi.mock('@/services/relay/relay-info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/relay/relay-info')>()),
  SUGGESTED_RELAYS: [{ url: 'wss://one.example' }, { url: 'wss://two.example' }],
  fetchRelayInfo: vi.fn(async (url: string) => info.byUrl[url] ?? null),
}));

import { AddRelayModal } from '@/app/[locale]/app/rail/AddRelayModal';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

function mount(methods: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const fake = fakeBridge({ configuredRelays: ['wss://two.example'] }, methods);
  renderWithBridge(<AddRelayModal onClose={onClose} />, fake);
  return { onClose };
}

const rowOf = (url: string) => screen.getByText(url).closest('li')!;

describe('AddRelayModal', () => {
  it('opens on the suggestions, named from NIP-11, and marks the ones already added', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('One')).toBeInTheDocument());
    expect(screen.getByText('The first relay')).toBeInTheDocument();
    // No NIP-11 name: the host stands in, and the description says there is none.
    expect(screen.getByText('two.example')).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
    const added = rowOf('wss://two.example').querySelector('button')!;
    expect(added).toHaveTextContent('Added');
    expect(added).toBeDisabled();
  });

  it('shows the relay icon, and the host letters on a tinted tile when it fails', async () => {
    mount();
    const img = await waitFor(() => {
      const found = rowOf('wss://one.example').querySelector('img');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(img.getAttribute('src')).toBe('https://one.example/i.png');
    fireEvent.error(img);
    expect(rowOf('wss://one.example').querySelector('img')).toBeNull();
  });

  it('adds a suggested relay without switching, then closes', async () => {
    const addRelay = vi.fn().mockResolvedValue(undefined);
    const switchRelay = vi.fn();
    const { onClose } = mount({ addRelay, switchRelay });
    await act(async () => { fireEvent.click(rowOf('wss://one.example').querySelector('button')!); });
    expect(addRelay).toHaveBeenCalledWith('wss://one.example');
    expect(switchRelay).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('adds and switches to a typed relay from the custom tab', async () => {
    const addRelay = vi.fn().mockResolvedValue(undefined);
    const switchRelay = vi.fn().mockResolvedValue(undefined);
    const { onClose } = mount({ addRelay, switchRelay });
    fireEvent.click(screen.getByText('Custom URL'));
    const field = screen.getByLabelText('Relay URL');
    expect(field).toHaveValue('wss://');
    fireEvent.change(field, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Add relay' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'custom.example' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add relay' })); });
    expect(addRelay).toHaveBeenCalledWith('wss://custom.example');
    expect(switchRelay).toHaveBeenCalledWith('wss://custom.example');
    expect(onClose).toHaveBeenCalled();
  });

  it('switches back to the suggestions', () => {
    mount();
    fireEvent.click(screen.getByText('Custom URL'));
    expect(screen.queryByText('wss://one.example')).toBeNull();
    fireEvent.click(screen.getByText('Suggested'));
    expect(screen.getByText('wss://one.example')).toBeInTheDocument();
  });
});
