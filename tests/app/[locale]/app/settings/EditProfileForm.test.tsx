import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const editUserMetadata = vi.hoisted(() => vi.fn());
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useSignerReady: () => true, nostrActions: { editUserMetadata } });
});
vi.mock('@/services/media/blossom', () => ({ uploadToBlossom: vi.fn(), BlossomUploadError: class extends Error {} }));

import { EditProfileForm } from '@/app/[locale]/app/settings/EditProfileForm';

const INITIAL = { displayName: 'Ana', name: 'ana', about: 'hi', picture: null, banner: null, nip05: 'ana@x.io', lud16: null, website: 'https://ana.io' };

function mount(onCancel = vi.fn(), onSaved = vi.fn()) {
  render(<LocaleProvider initialLocale="en"><EditProfileForm initial={INITIAL} onCancel={onCancel} onSaved={onSaved} /></LocaleProvider>);
  return { onCancel, onSaved };
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

  it('saves the trimmed profile, then reports it saved', async () => {
    editUserMetadata.mockResolvedValueOnce(undefined);
    const { onSaved } = mount();
    fireEvent.change(screen.getByLabelText('About'), { target: { value: '  new about ' } });
    await act(async () => { fireEvent.click(screen.getByTestId('save-profile-button')); });
    expect(editUserMetadata).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana', displayName: 'Ana', about: 'new about' }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('refuses to save without a name', async () => {
    editUserMetadata.mockClear();
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } });
    await act(async () => { fireEvent.click(screen.getByTestId('save-profile-button')); });
    expect(editUserMetadata).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('cancels', () => {
    const { onCancel } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
