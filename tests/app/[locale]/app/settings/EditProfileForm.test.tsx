import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useSignerReady: () => true });
});
vi.mock('@/services/blossom', () => ({ uploadToBlossom: vi.fn() }));

import { EditProfileForm } from '@/app/[locale]/app/settings/EditProfileForm';

const INITIAL = { displayName: 'Ana', name: 'ana', about: 'hi', picture: null, banner: null, nip05: 'ana@x.io', lud16: null, website: 'https://ana.io' };

function mount() {
  render(<LocaleProvider initialLocale="en"><EditProfileForm initial={INITIAL} onCancel={() => {}} onSaved={() => {}} /></LocaleProvider>);
}

describe('EditProfileForm', () => {
  it('prefills every field from the initial profile and focuses the name', () => {
    mount();
    expect(screen.getByLabelText('Name')).toHaveValue('Ana');
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.getByLabelText('About')).toHaveValue('hi');
    expect(screen.getByLabelText('NIP-05')).toHaveValue('ana@x.io');
    expect(screen.getByLabelText('Lightning address')).toHaveValue('');
    expect(screen.getByLabelText('Website')).toHaveValue('https://ana.io');
  });

  it('edits flow back into the fields', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Website'), { target: { value: 'https://b.io' } });
    expect(screen.getByLabelText('Website')).toHaveValue('https://b.io');
  });
});
